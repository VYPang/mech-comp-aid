"""Training session helpers for the live PINN Playground dashboard."""

from __future__ import annotations

import asyncio
import hashlib
import json
from typing import Any, Literal

import numpy as np
import torch
from pydantic import BaseModel, ConfigDict, Field
from scipy.interpolate import griddata
from starlette.websockets import WebSocket

from pinn_playground.backend.physics_env import (
    MaterialProps,
    OUTER_HI,
    OUTER_LO,
    equilibrium_residuals,
    geometry_mask_np,
    numpy_to_domain_tensor,
    pde_loss_domain,
    sample_boundary_points,
    sample_domain_points,
    stresses_plane_stress,
    strains_from_displacement,
)
from pinn_playground.backend.pinn_model import PINN, count_parameters, von_mises_grid
from pinn_playground.backend.problem_definition import FEMProblemConfig, FEMMeshConfig, StructuralProblemConfig


SamplingLiteral = Literal["uniform", "adaptive"]


class TeacherConfig(BaseModel):
    """
    Configuration for the optional teacher-guided training mode.

    The teacher term supervises PINN displacement at sparse points sampled from
    a high-resolution FEM solution of the *same* traction-driven problem. Only
    used when ``enabled`` is True.
    """

    model_config = ConfigDict(extra="ignore")

    enabled: bool = False
    n_interior: int = Field(default=120, ge=0, le=5000)
    n_boundary: int = Field(default=40, ge=0, le=2000)
    n_load_patch: int = Field(default=20, ge=0, le=500)
    weight: float = Field(default=10.0, gt=0.0, le=1000.0)
    seed: int = 7



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
    hidden_dim: int = Field(default=96, ge=8, le=256)
    n_hidden_layers: int = Field(default=5, ge=1, le=8)
    seed: int = 0
    stress_grid_n: int = Field(default=60, ge=16, le=120)
    update_every: int = Field(default=50, ge=1, le=500)
    # Residual-adaptive resampling (RAD): every K epochs, replace domain points
    # with new ones drawn with probability proportional to PDE residual.
    # Set to 0 to disable.
    residual_resample_every: int = Field(default=200, ge=0, le=5000)
    residual_resample_power: float = Field(default=1.0, ge=0.0, le=4.0)
    residual_resample_uniform_fraction: float = Field(default=0.3, ge=0.0, le=1.0)
    residual_resample_pool_factor: int = Field(default=4, ge=2, le=16)
    # Random Fourier feature input encoding (Tancik et al. 2020). Lifts the
    # network past the smooth-MLP spectral bias so it can represent sharp
    # corner stress concentrations.
    fourier_features: bool = False
    fourier_num_features: int = Field(default=16, ge=4, le=256)
    fourier_sigma: float = Field(default=1.0, gt=0.0, le=20.0)
    # Optional teacher-guided training. When enabled, a high-resolution FEM
    # solve of the same case is sampled sparsely and its displacement values
    # are added as a supervised regression target alongside the PDE and BC
    # losses. See `teacher_guided_pinn_plan.md` for the design rationale.
    teacher: TeacherConfig = Field(default_factory=TeacherConfig)

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
            fourier_features=config.fourier_features,
            fourier_num_features=config.fourier_num_features,
            fourier_sigma=config.fourier_sigma,
            fourier_seed=config.seed,
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

        # Build teacher dataset when guided mode is enabled. Heavy FEM solve
        # runs off-thread so it never blocks the websocket event loop.
        teacher_data: dict[str, Any] | None = None
        if config.teacher.enabled:
            teacher_data = await asyncio.to_thread(_build_teacher_dataset, config, device)
            if teacher_data is not None:
                await websocket.send_json(
                    {
                        "type": "teacher_preview",
                        "physics_case_id": config.physics_case_id(),
                        "counts": teacher_data["counts"],
                        "points": {
                            "interior": {
                                "x": _serialize_vector(teacher_data["xy_by_cat"]["interior"][:, 0])
                                if teacher_data["xy_by_cat"]["interior"].size
                                else [],
                                "y": _serialize_vector(teacher_data["xy_by_cat"]["interior"][:, 1])
                                if teacher_data["xy_by_cat"]["interior"].size
                                else [],
                            },
                            "boundary": {
                                "x": _serialize_vector(teacher_data["xy_by_cat"]["boundary"][:, 0])
                                if teacher_data["xy_by_cat"]["boundary"].size
                                else [],
                                "y": _serialize_vector(teacher_data["xy_by_cat"]["boundary"][:, 1])
                                if teacher_data["xy_by_cat"]["boundary"].size
                                else [],
                            },
                            "load_patch": {
                                "x": _serialize_vector(teacher_data["xy_by_cat"]["load_patch"][:, 0])
                                if teacher_data["xy_by_cat"]["load_patch"].size
                                else [],
                                "y": _serialize_vector(teacher_data["xy_by_cat"]["load_patch"][:, 1])
                                if teacher_data["xy_by_cat"]["load_patch"].size
                                else [],
                            },
                        },
                        "disp_scale": teacher_data["disp_scale"],
                    }
                )

        # Run FEM baseline at max resolution (off-thread; never blocks the training loop).
        fem_baseline_z: np.ndarray | None = None
        fem_baseline_result = await asyncio.to_thread(_build_fem_baseline, config, config.stress_grid_n)
        if fem_baseline_result is not None:
            fem_baseline_grid, fem_baseline_z = fem_baseline_result
            await websocket.send_json(
                {
                    "type": "fem_baseline",
                    "physics_case_id": config.physics_case_id(),
                    "stress_grid": fem_baseline_grid,
                }
            )

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

            teacher_loss = torch.zeros((), dtype=torch.float32, device=device)
            teacher_weight = 0.0
            if teacher_data is not None:
                u_pred, v_pred = model(teacher_data["x"], teacher_data["y"])
                teacher_loss = torch.mean(
                    (u_pred - teacher_data["u"]) ** 2
                    + (v_pred - teacher_data["v"]) ** 2
                )
                teacher_weight = float(config.teacher.weight)

            total_loss = (
                config.pde_weight * pde_loss
                + config.bc_weight * bc_loss
                + teacher_weight * teacher_loss
            )
            total_loss.backward()
            optimizer.step()
            scheduler.step()

            total_value = float(total_loss.detach().cpu().item())
            pde_value = float(pde_loss.detach().cpu().item())
            bc_value = float(bc_loss.detach().cpu().item())
            teacher_value = float(teacher_loss.detach().cpu().item()) if teacher_data is not None else None
            total_history.append(total_value)
            best_total = min(best_total, total_value)

            # Residual-adaptive resampling: every K epochs, draw a fresh candidate
            # pool, rank by PDE residual, and replace `domain_xy` with points where
            # the model is currently struggling. Mixed with a uniform fraction so
            # the network keeps seeing the full domain. Only active when the user
            # has selected the adaptive sampling strategy.
            if (
                config.sampling_strategy == "adaptive"
                and config.residual_resample_every > 0
                and epoch % config.residual_resample_every == 0
                and epoch < config.epochs
            ):
                domain_xy = _residual_adaptive_resample(
                    model=model,
                    geometry=config.problem,
                    material=training_material,
                    n_points=config.n_domain,
                    device=device,
                    seed=config.seed + epoch,
                    pool_factor=config.residual_resample_pool_factor,
                    power=config.residual_resample_power,
                    uniform_fraction=config.residual_resample_uniform_fraction,
                )
                await websocket.send_json(
                    {
                        "type": "resample",
                        "epoch": epoch,
                        "n_points": int(domain_xy.shape[0]),
                        "domain_points": {
                            "x": _serialize_vector(domain_xy[:, 0]),
                            "y": _serialize_vector(domain_xy[:, 1]),
                        },
                    }
                )

            if epoch == 1 or epoch % config.update_every == 0 or epoch == config.epochs:
                xg, yg, vm = von_mises_grid(
                    model,
                    config.problem,
                    grid_n=config.stress_grid_n,
                    mat=physical_material,
                    device=device,
                )
                error_grid: dict[str, Any] | None = None
                if fem_baseline_z is not None:
                    error_z = np.abs(vm - fem_baseline_z).astype(np.float32)
                    error_grid = _serialize_grid(xg, yg, error_z)
                await websocket.send_json(
                    {
                        "type": "metrics",
                        "physics_case_id": config.physics_case_id(),
                        "run_id": config.run_id(),
                        "epoch": epoch,
                        "total_loss": total_value,
                        "pde_loss": pde_value,
                        "bc_loss": bc_value,
                        "teacher_loss": teacher_value,
                        "stress_grid": _serialize_grid(xg, yg, vm),
                        "error_grid": error_grid,
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


def _build_fem_baseline(
    config: "TrainingConfig",
    grid_n: int,
) -> "tuple[dict[str, Any], np.ndarray] | None":
    """
    Run FEM at maximum mesh resolution using the same geometry/load as the PINN.

    Returns (serialised grid dict, z_np float32 array) so the caller can both
    forward-send the grid to the browser and compute element-wise errors.
    Returns None on any exception so a FEM failure never kills the PINN run.
    """
    try:
        from pinn_playground.backend.fem_solver import solve_fem_problem  # local import avoids circular dep

        fem_config = FEMProblemConfig(
            geometry=config.problem.geometry.model_dump(),
            material=config.problem.material.model_dump(),
            support=config.problem.support.model_dump(),
            load=config.problem.load.model_dump(),
            mesh=FEMMeshConfig(n_cells=180),  # maximum allowed mesh resolution
        )
        result = solve_fem_problem(fem_config, grid_n=grid_n)
        grid = result["stress_grid"]
        z_np = np.array(
            [[np.nan if v is None else float(v) for v in row] for row in grid["z"]],
            dtype=np.float32,
        )
        # No rescaling needed: PINN display uses physical_material.young = traction_scale,
        # which maps training-level O(1) stresses back to the physical traction magnitude.
        # FEM solves with the same traction BCs, and in linear elasticity the stress
        # field is independent of E, so both outputs are already in the same units.
        return grid, z_np
    except Exception:
        return None


def _masked_mse(values: torch.Tensor, target: torch.Tensor, mask: torch.Tensor) -> torch.Tensor:
    if not torch.any(mask):
        return torch.zeros((), dtype=values.dtype, device=values.device)
    selected = values[mask]
    return torch.mean((selected - target) ** 2)


def _residual_adaptive_resample(
    *,
    model: PINN,
    geometry: StructuralProblemConfig,
    material: MaterialProps,
    n_points: int,
    device: torch.device,
    seed: int,
    pool_factor: int,
    power: float,
    uniform_fraction: float,
) -> np.ndarray:
    """
    Residual-adaptive density (RAD) resampling.

    Draws a candidate pool that is `pool_factor` times larger than `n_points`,
    evaluates the squared PDE residual at every candidate, and samples
    `n_points` without replacement with probability proportional to
    ``residual ** power``. A `uniform_fraction` of the output is drawn
    uniformly so the network keeps seeing the full domain.
    """
    n_residual = max(1, int(round(n_points * (1.0 - uniform_fraction))))
    n_uniform = max(0, n_points - n_residual)

    rng = np.random.default_rng(seed)
    pool_target = max(n_residual * pool_factor, 256)

    # Reject-sample inside the geometry mask until pool is full.
    pool_xy: list[np.ndarray] = []
    collected = 0
    batch = max(pool_target * 2, 512)
    while collected < pool_target:
        xs = rng.random(batch).astype(np.float32)
        ys = rng.random(batch).astype(np.float32)
        m = geometry_mask_np(xs, ys, geometry)
        sel = np.stack([xs[m], ys[m]], axis=1)
        if sel.size == 0:
            batch *= 2
            continue
        pool_xy.append(sel)
        collected += sel.shape[0]
    pool = np.concatenate(pool_xy, axis=0)[:pool_target].astype(np.float32)

    # Evaluate squared residual at the pool. Build a fresh graph; do not retain.
    model.eval()
    x_t = torch.tensor(pool[:, 0:1], dtype=torch.float32, device=device, requires_grad=True)
    y_t = torch.tensor(pool[:, 1:2], dtype=torch.float32, device=device, requires_grad=True)
    u, v = model(x_t, y_t)
    eps_xx, eps_yy, gamma_xy = strains_from_displacement(u, v, x_t, y_t)
    sxx, syy, txy = stresses_plane_stress(eps_xx, eps_yy, gamma_xy, material)
    rx, ry = equilibrium_residuals(sxx, syy, txy, x_t, y_t)
    res = (rx**2 + ry**2).detach().cpu().numpy().reshape(-1)
    model.train()

    # Probability ∝ residual**power, with a small floor so all points retain
    # nonzero probability.
    weights = np.power(np.maximum(res, 1e-12), float(power))
    weight_sum = weights.sum()
    if not np.isfinite(weight_sum) or weight_sum <= 0.0:
        # Pathological case (network outputs all zeros): fall back to uniform.
        idx = rng.choice(pool.shape[0], size=n_residual, replace=False)
    else:
        probs = weights / weight_sum
        # `replace=False` requires probs to have at least n_residual nonzero entries.
        n_nonzero = int(np.count_nonzero(probs))
        if n_nonzero < n_residual:
            idx = rng.choice(pool.shape[0], size=n_residual, replace=False)
        else:
            idx = rng.choice(pool.shape[0], size=n_residual, replace=False, p=probs)
    residual_pts = pool[idx]

    if n_uniform > 0:
        uniform_pts = _residual_uniform_fill(geometry, n_uniform, rng)
        return np.concatenate([residual_pts, uniform_pts], axis=0).astype(np.float32)
    return residual_pts.astype(np.float32)


def _residual_uniform_fill(
    geometry: StructuralProblemConfig,
    n: int,
    rng: np.random.Generator,
) -> np.ndarray:
    """Uniform rejection sampling inside the geometry mask, used for RAD mixing."""
    out: list[np.ndarray] = []
    remaining = n
    batch = max(remaining * 4, 256)
    while remaining > 0:
        xs = rng.random(batch).astype(np.float32)
        ys = rng.random(batch).astype(np.float32)
        m = geometry_mask_np(xs, ys, geometry)
        sel = np.stack([xs[m], ys[m]], axis=1)
        if sel.shape[0] == 0:
            batch *= 2
            continue
        take = min(remaining, sel.shape[0])
        out.append(sel[:take])
        remaining -= take
    return np.concatenate(out, axis=0).astype(np.float32)


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


# ---------------------------------------------------------------------------
# Teacher-guided training helpers
# ---------------------------------------------------------------------------


def _teacher_displacement_scale(problem: StructuralProblemConfig) -> float:
    """
    Map FEM displacement (in physical units) onto the displacement scale the
    PINN actually learns during training.

    The PINN is trained with a normalized material (E=1) and a normalized top
    traction (|t|=1 after dividing by ``traction_scale``). In linear elasticity
    under traction loading, stress is independent of E, so the PINN's training
    strain is ``ε_train = σ_phys / traction_scale`` and the training
    displacement is larger than the physical one by the factor
    ``young_phys / traction_scale``.
    """
    traction_scale = max(
        abs(float(problem.load.traction_x)),
        abs(float(problem.load.traction_y)),
        1e-12,
    )
    young_phys = float(problem.material.young)
    return young_phys / traction_scale


def sample_teacher_points_xy(
    problem: StructuralProblemConfig,
    *,
    n_interior: int,
    n_boundary: int,
    n_load_patch: int,
    seed: int,
) -> dict[str, np.ndarray]:
    """
    Sample teacher point coordinates grouped by category. FEM data is not
    required here: categorization depends only on geometry and load patch
    location. All three groups use uniform sampling within their own region.
    """
    rng = np.random.default_rng(seed)

    if n_interior > 0:
        interior = _sample_uniform_filtered_problem(n_interior, problem, rng)
    else:
        interior = np.zeros((0, 2), dtype=np.float32)

    boundary_pts = _sample_boundary_excluding_load_patch(
        problem=problem,
        n_points=n_boundary,
        rng=rng,
    )

    if n_load_patch > 0:
        xs = rng.uniform(
            float(problem.load.x_min),
            float(problem.load.x_max),
            size=n_load_patch,
        ).astype(np.float32)
        ys = np.full(n_load_patch, float(OUTER_HI), dtype=np.float32)
        load_pts = np.stack([xs, ys], axis=1)
    else:
        load_pts = np.zeros((0, 2), dtype=np.float32)

    return {
        "interior": interior,
        "boundary": boundary_pts,
        "load_patch": load_pts,
    }


def _sample_uniform_filtered_problem(
    n: int,
    problem: StructuralProblemConfig,
    rng: np.random.Generator,
) -> np.ndarray:
    """Rejection sample uniform interior points inside the solid domain."""
    out: list[np.ndarray] = []
    remaining = n
    batch = max(remaining * 4, 256)
    while remaining > 0:
        xs = rng.random(batch).astype(np.float32)
        ys = rng.random(batch).astype(np.float32)
        m = geometry_mask_np(xs, ys, problem)
        sel = np.stack([xs[m], ys[m]], axis=1)
        if sel.shape[0] == 0:
            batch *= 2
            continue
        take = min(remaining, sel.shape[0])
        out.append(sel[:take])
        remaining -= take
    return np.concatenate(out, axis=0).astype(np.float32)


def _sample_boundary_excluding_load_patch(
    *,
    problem: StructuralProblemConfig,
    n_points: int,
    rng: np.random.Generator,
) -> np.ndarray:
    """
    Draw boundary teacher points from the full solid boundary but exclude the
    traction patch on the top edge. The patch is already represented by a
    dedicated category.
    """
    if n_points <= 0:
        return np.zeros((0, 2), dtype=np.float32)

    oversample = max(n_points * 4, 64)
    per_edge = max(2, oversample // 8)
    bx, by, _, _ = sample_boundary_points(
        per_edge,
        problem,
        seed=int(rng.integers(low=0, high=2**31 - 1)),
    )
    if bx.size == 0:
        return np.zeros((0, 2), dtype=np.float32)

    top_mask = np.isclose(by, float(OUTER_HI), atol=1e-6, rtol=0.0)
    load_mask = (
        top_mask
        & (bx >= float(problem.load.x_min))
        & (bx <= float(problem.load.x_max))
    )
    keep = np.stack([bx[~load_mask], by[~load_mask]], axis=1).astype(np.float32)
    if keep.shape[0] == 0:
        return np.zeros((0, 2), dtype=np.float32)

    if keep.shape[0] <= n_points:
        return keep
    idx = rng.choice(keep.shape[0], size=n_points, replace=False)
    return keep[idx]


def _interpolate_fem_displacement(
    nodes: np.ndarray,
    ux: np.ndarray,
    uy: np.ndarray,
    teacher_xy: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    """Interpolate FEM nodal displacement onto teacher sample locations."""
    if teacher_xy.shape[0] == 0:
        return (
            np.zeros((0,), dtype=np.float64),
            np.zeros((0,), dtype=np.float64),
        )

    ux_lin = griddata(nodes, ux, teacher_xy, method="linear")
    uy_lin = griddata(nodes, uy, teacher_xy, method="linear")
    ux_near = griddata(nodes, ux, teacher_xy, method="nearest")
    uy_near = griddata(nodes, uy, teacher_xy, method="nearest")
    ux_out = np.where(np.isfinite(ux_lin), ux_lin, ux_near)
    uy_out = np.where(np.isfinite(uy_lin), uy_lin, uy_near)
    return ux_out.astype(np.float64), uy_out.astype(np.float64)


def _build_teacher_dataset(
    config: "TrainingConfig",
    device: torch.device,
) -> "dict[str, Any] | None":
    """
    Run the high-resolution FEM teacher solve, sample teacher points, and
    rescale the FEM displacements onto the PINN training scale. Returns a
    dictionary with ``x, y, u, v`` tensors on ``device`` plus a categorized
    xy preview dict. Returns ``None`` if no category requested any points or
    the FEM solve fails.
    """
    teacher = config.teacher
    if not teacher.enabled:
        return None
    if teacher.n_interior + teacher.n_boundary + teacher.n_load_patch <= 0:
        return None

    try:
        from pinn_playground.backend.fem_solver import solve_fem_for_teacher  # local import

        nodes, ux_phys, uy_phys = solve_fem_for_teacher(config.problem)
    except Exception:
        return None

    xy_by_cat = sample_teacher_points_xy(
        config.problem,
        n_interior=teacher.n_interior,
        n_boundary=teacher.n_boundary,
        n_load_patch=teacher.n_load_patch,
        seed=int(teacher.seed) if teacher.seed is not None else int(config.seed) + 9999,
    )
    all_xy = np.concatenate(
        [xy_by_cat["interior"], xy_by_cat["boundary"], xy_by_cat["load_patch"]],
        axis=0,
    ).astype(np.float64)
    if all_xy.shape[0] == 0:
        return None

    ux_at, uy_at = _interpolate_fem_displacement(nodes, ux_phys, uy_phys, all_xy)
    disp_scale = _teacher_displacement_scale(config.problem)
    ux_train = (ux_at * disp_scale).astype(np.float32)
    uy_train = (uy_at * disp_scale).astype(np.float32)

    x_tensor = torch.tensor(all_xy[:, 0:1].astype(np.float32), dtype=torch.float32, device=device)
    y_tensor = torch.tensor(all_xy[:, 1:2].astype(np.float32), dtype=torch.float32, device=device)
    u_tensor = torch.tensor(ux_train.reshape(-1, 1), dtype=torch.float32, device=device)
    v_tensor = torch.tensor(uy_train.reshape(-1, 1), dtype=torch.float32, device=device)

    return {
        "xy_by_cat": xy_by_cat,
        "x": x_tensor,
        "y": y_tensor,
        "u": u_tensor,
        "v": v_tensor,
        "counts": {
            "interior": int(xy_by_cat["interior"].shape[0]),
            "boundary": int(xy_by_cat["boundary"].shape[0]),
            "load_patch": int(xy_by_cat["load_patch"].shape[0]),
        },
        "disp_scale": float(disp_scale),
    }


def build_teacher_preview_payload(config: "TrainingConfig") -> dict[str, Any]:
    """
    Return teacher point coordinates grouped by category for the browser
    overlay. Does not require running FEM and is safe for interactive preview.
    """
    if not config.teacher.enabled:
        return {
            "type": "teacher_preview",
            "case_id": config.physics_case_id(),
            "enabled": False,
            "counts": {"interior": 0, "boundary": 0, "load_patch": 0},
            "points": {
                "interior": {"x": [], "y": []},
                "boundary": {"x": [], "y": []},
                "load_patch": {"x": [], "y": []},
            },
        }

    xy_by_cat = sample_teacher_points_xy(
        config.problem,
        n_interior=config.teacher.n_interior,
        n_boundary=config.teacher.n_boundary,
        n_load_patch=config.teacher.n_load_patch,
        seed=int(config.teacher.seed) if config.teacher.seed is not None else int(config.seed) + 9999,
    )

    def _serialize(group: np.ndarray) -> dict[str, list[float]]:
        if group.shape[0] == 0:
            return {"x": [], "y": []}
        return {
            "x": _serialize_vector(group[:, 0]),
            "y": _serialize_vector(group[:, 1]),
        }

    return {
        "type": "teacher_preview",
        "case_id": config.physics_case_id(),
        "enabled": True,
        "counts": {
            "interior": int(xy_by_cat["interior"].shape[0]),
            "boundary": int(xy_by_cat["boundary"].shape[0]),
            "load_patch": int(xy_by_cat["load_patch"].shape[0]),
        },
        "points": {
            "interior": _serialize(xy_by_cat["interior"]),
            "boundary": _serialize(xy_by_cat["boundary"]),
            "load_patch": _serialize(xy_by_cat["load_patch"]),
        },
    }

