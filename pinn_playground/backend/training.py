"""Training session helpers for the live PINN Playground dashboard."""

from __future__ import annotations

import asyncio
import hashlib
import json
from typing import Any, Literal

import numpy as np
import torch
from pydantic import BaseModel, ConfigDict, Field
from starlette.websockets import WebSocket

from pinn_playground.backend.physics_env import (
    MaterialProps,
    OUTER_HI,
    OUTER_LO,
    numpy_to_domain_tensor,
    pde_loss_domain,
    sample_boundary_points,
    sample_domain_points,
    stresses_plane_stress,
    strains_from_displacement,
)
from pinn_playground.backend.pinn_model import PINN, count_parameters, von_mises_grid
from pinn_playground.backend.problem_definition import StructuralProblemConfig


SamplingLiteral = Literal["uniform", "adaptive"]


class TrainingConfig(BaseModel):
    """Browser-facing configuration for one training run."""

    model_config = ConfigDict(extra="ignore")

    problem: StructuralProblemConfig = Field(default_factory=StructuralProblemConfig)
    sampling_strategy: SamplingLiteral = "uniform"
    n_domain: int = Field(default=900, ge=100, le=12000)
    n_boundary: int = Field(default=160, ge=16, le=4000)
    epochs: int = Field(default=500, ge=10, le=5000)
    normalize_inputs: bool = True
    pde_weight: float = Field(default=1.0, gt=0.0, le=100.0)
    bc_weight: float = Field(default=5.0, gt=0.0, le=100.0)
    learning_rate: float = Field(default=1e-3, gt=0.0, le=1.0)
    hidden_dim: int = Field(default=48, ge=8, le=256)
    n_hidden_layers: int = Field(default=4, ge=1, le=8)
    seed: int = 0
    stress_grid_n: int = Field(default=40, ge=16, le=80)
    update_every: int = Field(default=50, ge=1, le=500)

    def physics_case_id(self) -> str:
        return self.problem.case_id()

    def run_id(self) -> str:
        payload = json.dumps(self.model_dump(mode="json"), sort_keys=True)
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:12]


def pick_device() -> torch.device:
    """Prefer CUDA when available but keep the code CPU-friendly."""
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")


def build_preview_payload(config: TrainingConfig) -> dict[str, Any]:
    """Generate collocation preview points for the dashboard scatter plot."""
    domain_xy = sample_domain_points(
        config.n_domain,
        config.problem,
        config.sampling_strategy,
        seed=config.seed,
    )
    boundary_per_edge = _boundary_points_per_edge(config.n_boundary)
    bx, by, _, _ = sample_boundary_points(
        boundary_per_edge,
        config.problem,
        seed=config.seed + 1,
    )
    return {
        "type": "preview",
        "case_id": config.physics_case_id(),
        "geometry": config.problem.geometry.model_dump(),
        "material": config.problem.material.model_dump(),
        "support": config.problem.support.model_dump(),
        "load": config.problem.load.model_dump(),
        "sampling_strategy": config.sampling_strategy,
        "domain_points": {
            "x": _serialize_vector(domain_xy[:, 0]),
            "y": _serialize_vector(domain_xy[:, 1]),
        },
        "boundary_points": {
            "x": _serialize_vector(bx),
            "y": _serialize_vector(by),
        },
        "counts": {
            "n_domain": int(domain_xy.shape[0]),
            "n_boundary": int(bx.shape[0]),
        },
    }


async def stream_training_session(
    websocket: WebSocket,
    config: TrainingConfig,
    cancel_event: asyncio.Event,
) -> None:
    """Train one PINN and stream preview/metrics messages over the websocket."""
    try:
        device = pick_device()
        _seed_everything(config.seed)
        training_material = _training_material(config.problem)
        traction_scale = max(
            abs(float(config.problem.load.traction_x)),
            abs(float(config.problem.load.traction_y)),
            1e-12,
        )
        physical_material = MaterialProps(
            young=traction_scale,
            poisson=config.problem.material.poisson,
        )
        model = PINN(
            hidden_dim=config.hidden_dim,
            n_hidden_layers=config.n_hidden_layers,
            normalize_inputs=config.normalize_inputs,
        ).to(device)
        optimizer = torch.optim.Adam(model.parameters(), lr=config.learning_rate)
        scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
            optimizer,
            T_max=max(config.epochs, 1),
            eta_min=max(config.learning_rate * 0.01, 1e-6),
        )

        await websocket.send_json(
            {
                "type": "session",
                "device": str(device),
                "parameter_count": count_parameters(model),
                "physics_case_id": config.physics_case_id(),
                "run_id": config.run_id(),
                "config": config.model_dump(),
            }
        )
        await websocket.send_json(build_preview_payload(config))

        domain_xy = sample_domain_points(
            config.n_domain,
            config.problem,
            config.sampling_strategy,
            seed=config.seed,
        )
        boundary_per_edge = _boundary_points_per_edge(config.n_boundary)
        bx_np, by_np, nx_np, ny_np = sample_boundary_points(
            boundary_per_edge,
            config.problem,
            seed=config.seed + 1,
        )

        total_history: list[float] = []
        best_total = float("inf")

        for epoch in range(1, config.epochs + 1):
            if cancel_event.is_set():
                await websocket.send_json(
                    {
                        "type": "complete",
                        "status": "stopped",
                        "epoch": epoch - 1,
                        "best_total_loss": best_total if np.isfinite(best_total) else None,
                    }
                )
                return

            model.train()
            optimizer.zero_grad(set_to_none=True)

            x_dom, y_dom = numpy_to_domain_tensor(domain_xy, device=device)
            u_dom, v_dom = model(x_dom, y_dom)
            pde_loss = pde_loss_domain(u_dom, v_dom, x_dom, y_dom, training_material)

            bc_loss = boundary_condition_loss(
                model=model,
                bx_np=bx_np,
                by_np=by_np,
                nx_np=nx_np,
                ny_np=ny_np,
                problem=config.problem,
                material=training_material,
                device=device,
            )

            total_loss = config.pde_weight * pde_loss + config.bc_weight * bc_loss
            total_loss.backward()
            optimizer.step()
            scheduler.step()

            total_value = float(total_loss.detach().cpu().item())
            pde_value = float(pde_loss.detach().cpu().item())
            bc_value = float(bc_loss.detach().cpu().item())
            total_history.append(total_value)
            best_total = min(best_total, total_value)

            if epoch == 1 or epoch % config.update_every == 0 or epoch == config.epochs:
                xg, yg, vm = von_mises_grid(
                    model,
                    config.problem,
                    grid_n=config.stress_grid_n,
                    mat=physical_material,
                    device=device,
                )
                await websocket.send_json(
                    {
                        "type": "metrics",
                        "physics_case_id": config.physics_case_id(),
                        "run_id": config.run_id(),
                        "epoch": epoch,
                        "total_loss": total_value,
                        "pde_loss": pde_value,
                        "bc_loss": bc_value,
                        "stress_grid": _serialize_grid(xg, yg, vm),
                        "history_tail": _history_tail(total_history),
                    }
                )

            await asyncio.sleep(0)

        await websocket.send_json(
            {
                "type": "complete",
                "status": "completed",
                "epoch": config.epochs,
                "best_total_loss": best_total,
            }
        )
    except Exception as exc:
        await websocket.send_json({"type": "error", "message": str(exc)})


def boundary_condition_loss(
    *,
    model: PINN,
    bx_np: np.ndarray,
    by_np: np.ndarray,
    nx_np: np.ndarray,
    ny_np: np.ndarray,
    problem: StructuralProblemConfig,
    material: MaterialProps,
    device: torch.device,
) -> torch.Tensor:
    """
    Shared structural boundary conditions:
    - bottom outer edge clamped (u=v=0)
    - top patch receives the configured traction vector
    - the remaining boundary is traction free
    """
    bx = torch.tensor(bx_np.reshape(-1, 1), dtype=torch.float32, device=device, requires_grad=True)
    by = torch.tensor(by_np.reshape(-1, 1), dtype=torch.float32, device=device, requires_grad=True)
    nx = torch.tensor(nx_np.reshape(-1, 1), dtype=torch.float32, device=device)
    ny = torch.tensor(ny_np.reshape(-1, 1), dtype=torch.float32, device=device)

    u, v = model(bx, by)
    eps_xx, eps_yy, gamma_xy = strains_from_displacement(u, v, bx, by)
    sxx, syy, txy = stresses_plane_stress(eps_xx, eps_yy, gamma_xy, material)
    tx = sxx * nx + txy * ny
    ty = txy * nx + syy * ny

    bottom_mask = torch.isclose(by, torch.full_like(by, OUTER_LO), atol=1e-6, rtol=0.0)
    top_mask = torch.isclose(by, torch.full_like(by, OUTER_HI), atol=1e-6, rtol=0.0)
    x_min = torch.full_like(bx, problem.load.x_min)
    x_max = torch.full_like(bx, problem.load.x_max)
    load_mask = top_mask & (bx >= x_min) & (bx <= x_max)
    free_mask = ~(bottom_mask | load_mask)

    zero = torch.zeros(1, dtype=torch.float32, device=device)
    traction_scale = max(
        abs(float(problem.load.traction_x)),
        abs(float(problem.load.traction_y)),
        1e-12,
    )
    traction_x = torch.full(
        (1,),
        float(problem.load.traction_x) / traction_scale,
        dtype=torch.float32,
        device=device,
    )
    traction_y = torch.full(
        (1,),
        float(problem.load.traction_y) / traction_scale,
        dtype=torch.float32,
        device=device,
    )

    support_loss = _masked_mse(u, zero, bottom_mask) + _masked_mse(v, zero, bottom_mask)
    load_loss = _masked_mse(tx, traction_x, load_mask) + _masked_mse(ty, traction_y, load_mask)
    free_loss = _masked_mse(tx, zero, free_mask) + _masked_mse(ty, zero, free_mask)
    return support_loss + load_loss + free_loss


def _training_material(problem: StructuralProblemConfig) -> MaterialProps:
    return MaterialProps(young=1.0, poisson=problem.material.poisson)


def _masked_mse(values: torch.Tensor, target: torch.Tensor, mask: torch.Tensor) -> torch.Tensor:
    if not torch.any(mask):
        return torch.zeros((), dtype=values.dtype, device=values.device)
    selected = values[mask]
    return torch.mean((selected - target) ** 2)


def _history_tail(history: list[float], n: int = 5) -> list[float]:
    return [round(value, 6) for value in history[-n:]]


def _boundary_points_per_edge(total_boundary_points: int) -> int:
    return max(2, total_boundary_points // 8)


def _seed_everything(seed: int) -> None:
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def _serialize_vector(values: np.ndarray) -> list[float]:
    return [float(v) for v in values.astype(np.float32).tolist()]


def _serialize_grid(x: np.ndarray, y: np.ndarray, z: np.ndarray) -> dict[str, Any]:
    x_axis = [float(v) for v in x[0, :].tolist()]
    y_axis = [float(v) for v in y[:, 0].tolist()]
    z_rows: list[list[float | None]] = []
    for row in z.tolist():
        z_rows.append([None if value is None or not np.isfinite(value) else float(value) for value in row])
    return {"x": x_axis, "y": y_axis, "z": z_rows}
