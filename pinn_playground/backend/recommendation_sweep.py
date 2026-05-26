#!/usr/bin/env python3
"""Offline sweep harness for PINN tutor recommendations.

This module runs the real training loop without the browser, captures the
emitted FEM comparison grids, and ranks logical candidate configurations by
their final stress-field error against the high-resolution FEM baseline.

Example:

    python -m pinn_playground.backend.recommendation_sweep --epochs 800 \
      --output pinn_playground/doc/recommendation_sweep_results.json
"""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

import numpy as np

from pinn_playground.backend.training import TrainingConfig, stream_training_session


GEOMETRIES = ("base", "diagonal", "x_brace")


@dataclass(frozen=True)
class CandidateCase:
    """One logical PINN configuration to benchmark."""

    name: str
    geometry: str
    description: str
    overrides: dict[str, Any]


class CaptureWebSocket:
    """Minimal websocket stand-in used by ``stream_training_session``."""

    def __init__(self) -> None:
        self.messages: list[dict[str, Any]] = []

    async def send_json(self, payload: dict[str, Any]) -> None:
        message_type = payload.get("type")
        if message_type == "preview":
            self.messages.append(
                {
                    "type": "preview",
                    "counts": payload.get("counts"),
                    "sampling_strategy": payload.get("sampling_strategy"),
                }
            )
            return
        if message_type == "teacher_preview":
            self.messages.append(
                {
                    "type": "teacher_preview",
                    "counts": payload.get("counts"),
                    "disp_scale": payload.get("disp_scale"),
                }
            )
            return
        if message_type == "resample":
            self.messages.append(
                {
                    "type": "resample",
                    "epoch": payload.get("epoch"),
                    "n_points": payload.get("n_points"),
                }
            )
            return
        self.messages.append(payload)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Benchmark logical PINN recommendation cases.")
    parser.add_argument(
        "--epochs",
        type=int,
        default=800,
        help="Training epochs for every candidate run.",
    )
    parser.add_argument(
        "--stress-grid-n",
        type=int,
        default=40,
        help="Stress/error grid resolution used for FEM-vs-PINN comparison.",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=0,
        help="Random seed shared across all runs so candidates remain comparable.",
    )
    parser.add_argument(
        "--geometries",
        nargs="+",
        choices=GEOMETRIES,
        default=list(GEOMETRIES),
        help="Subset of geometries to benchmark.",
    )
    parser.add_argument(
        "--case-filter",
        action="append",
        default=[],
        help="Optional substring filter applied to candidate names/descriptions. Repeatable.",
    )
    parser.add_argument(
        "--list-cases",
        action="store_true",
        help="List candidate case names and exit without running training.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Optional JSON file path for detailed sweep results.",
    )
    return parser.parse_args()


def build_candidate_cases(epochs: int) -> list[CandidateCase]:
    """Logical benchmark cases guided by the current tutoring hypotheses."""
    cases: list[CandidateCase] = []
    for geometry in GEOMETRIES:
        cases.append(
            CandidateCase(
                name=f"{geometry}-baseline",
                geometry=geometry,
                description="Normalized baseline with no teacher supervision.",
                overrides={},
            )
        )

        if geometry == "base":
            cases.extend(
                [
                    CandidateCase(
                        name="base-boundary-only",
                        geometry=geometry,
                        description="Boundary-first teacher guidance for the base frame.",
                        overrides=teacher_overrides(n_boundary=60),
                    ),
                    CandidateCase(
                        name="base-interior-only",
                        geometry=geometry,
                        description="Interior-only teacher guidance for the base frame.",
                        overrides=teacher_overrides(n_interior=60),
                    ),
                    CandidateCase(
                        name="base-load-patch-only",
                        geometry=geometry,
                        description="Only load-patch teacher anchors; useful as a comparison, but not the first teacher intervention.",
                        overrides=teacher_overrides(n_load_patch=12),
                    ),
                    CandidateCase(
                        name="base-load-patch-boundary",
                        geometry=geometry,
                        description="Mixed boundary plus load-patch teacher guidance for the base frame.",
                        overrides=teacher_overrides(n_boundary=60, n_load_patch=12),
                    ),
                    CandidateCase(
                        name="base-load-patch-boundary-adaptive",
                        geometry=geometry,
                        description="Same teacher recipe as base-load-patch-boundary, plus adaptive collocation.",
                        overrides=deep_update_dict(
                            teacher_overrides(n_boundary=60, n_load_patch=12),
                            {
                                "sampling_strategy": "adaptive",
                                "residual_resample_every": max(200, min(epochs // 4, 400)),
                            },
                        ),
                    ),
                    CandidateCase(
                        name="base-load-patch-boundary-fourier",
                        geometry=geometry,
                        description="Same teacher recipe as base-load-patch-boundary, plus Fourier features.",
                        overrides=deep_update_dict(
                            teacher_overrides(n_boundary=60, n_load_patch=12),
                            {
                                "fourier_features": True,
                                "fourier_sigma": 1.5,
                            },
                        ),
                    ),
                ]
            )
            continue

        cases.extend(
            [
                CandidateCase(
                    name=f"{geometry}-interior-heavy",
                    geometry=geometry,
                    description="Interior-heavy teacher guidance for reinforced geometries.",
                    overrides=teacher_overrides(n_interior=240),
                ),
                CandidateCase(
                    name=f"{geometry}-interior-load-patch",
                    geometry=geometry,
                    description="Interior teacher points plus a few load-patch anchors.",
                    overrides=teacher_overrides(n_interior=240, n_load_patch=8),
                ),
                CandidateCase(
                    name=f"{geometry}-interior-boundary-load-patch",
                    geometry=geometry,
                    description="Interior-heavy guidance with boundary and load-patch support.",
                    overrides=teacher_overrides(n_interior=240, n_boundary=40, n_load_patch=8),
                ),
                CandidateCase(
                    name=f"{geometry}-interior-boundary-load-patch-adaptive",
                    geometry=geometry,
                    description="Interior-heavy guidance plus adaptive collocation.",
                    overrides=deep_update_dict(
                        teacher_overrides(n_interior=240, n_boundary=40, n_load_patch=8),
                        {
                            "sampling_strategy": "adaptive",
                            "residual_resample_every": max(200, min(epochs // 4, 400)),
                        },
                    ),
                ),
                CandidateCase(
                    name=f"{geometry}-interior-boundary-load-patch-fourier",
                    geometry=geometry,
                    description="Interior-heavy guidance plus Fourier features for a sanity check.",
                    overrides=deep_update_dict(
                        teacher_overrides(n_interior=240, n_boundary=40, n_load_patch=8),
                        {
                            "fourier_features": True,
                            "fourier_sigma": 1.5,
                        },
                    ),
                ),
            ]
        )

    return cases


def teacher_overrides(
    *,
    n_interior: int = 0,
    n_boundary: int = 0,
    n_load_patch: int = 0,
    weight: float = 10.0,
) -> dict[str, Any]:
    enabled = any(count > 0 for count in (n_interior, n_boundary, n_load_patch))
    return {
        "teacher": {
            "enabled": enabled,
            "n_interior": n_interior,
            "n_boundary": n_boundary,
            "n_load_patch": n_load_patch,
            "weight": weight,
        }
    }


def deep_update_dict(base: dict[str, Any], updates: dict[str, Any]) -> dict[str, Any]:
    result = json.loads(json.dumps(base))
    for key, value in updates.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key] = deep_update_dict(result[key], value)
        else:
            result[key] = value
    return result


def build_training_payload(case: CandidateCase, epochs: int, stress_grid_n: int, seed: int) -> dict[str, Any]:
    """Create one backend TrainingConfig payload from a benchmark case."""
    payload: dict[str, Any] = {
        "problem": {
            "geometry": {
                "geometry": case.geometry,
                "frame_thickness": 0.18,
                "brace_half_width": 0.018,
            },
            "material": {
                "young": 210e9,
                "poisson": 0.3,
            },
            "support": {
                "fixed_edge": "bottom",
            },
            "load": {
                "edge": "top",
                "patch_center": 0.5,
                "patch_width": 0.2,
                "traction_x": 0.0,
                "traction_y": -1.0,
            },
        },
        "sampling_strategy": "uniform",
        "n_domain": 1200,
        "n_boundary": 200,
        "epochs": epochs,
        "normalize_inputs": True,
        "pde_weight": 1.0,
        "bc_weight": 5.0,
        "learning_rate": 1e-3,
        "hidden_dim": 96,
        "n_hidden_layers": 5,
        "seed": seed,
        "stress_grid_n": stress_grid_n,
        "update_every": max(1, min(epochs, 500)),
        "residual_resample_every": max(200, min(epochs // 4, 400)),
        "residual_resample_power": 1.0,
        "residual_resample_uniform_fraction": 0.3,
        "residual_resample_pool_factor": 4,
        "fourier_features": False,
        "fourier_num_features": 16,
        "fourier_sigma": 1.0,
        "teacher": {
            "enabled": False,
            "n_interior": 0,
            "n_boundary": 0,
            "n_load_patch": 0,
            "weight": 10.0,
            "seed": seed + 7,
        },
    }
    return deep_update_dict(payload, case.overrides)


async def run_case(case: CandidateCase, *, epochs: int, stress_grid_n: int, seed: int) -> dict[str, Any]:
    config = TrainingConfig.model_validate(build_training_payload(case, epochs, stress_grid_n, seed))
    capture = CaptureWebSocket()
    cancel_event = asyncio.Event()
    started = time.perf_counter()
    await stream_training_session(capture, config, cancel_event)
    duration_sec = time.perf_counter() - started
    return summarize_case(case, config, capture.messages, duration_sec)


def summarize_case(
    case: CandidateCase,
    config: TrainingConfig,
    messages: list[dict[str, Any]],
    duration_sec: float,
) -> dict[str, Any]:
    errors = [message for message in messages if message.get("type") == "error"]
    if errors:
        raise RuntimeError(f"{case.name} failed: {errors[-1].get('message', 'unknown error')}")

    session_message = last_message(messages, "session")
    fem_message = last_message(messages, "fem_baseline")
    metrics_message = last_message(messages, "metrics")
    completion_message = last_message(messages, "complete")

    if fem_message is None or metrics_message is None or completion_message is None:
        raise RuntimeError(f"{case.name} did not emit a full training summary.")

    fem_grid = grid_to_numpy(fem_message["stress_grid"])
    pinn_grid = grid_to_numpy(metrics_message["stress_grid"])
    error_grid = grid_to_numpy(metrics_message["error_grid"]) if metrics_message.get("error_grid") else np.abs(pinn_grid - fem_grid)
    error_stats = summarize_error_arrays(pinn_grid, fem_grid, error_grid)

    return {
        "name": case.name,
        "geometry": case.geometry,
        "description": case.description,
        "duration_sec": round(duration_sec, 3),
        "status": completion_message.get("status"),
        "device": session_message.get("device") if session_message else None,
        "parameter_count": session_message.get("parameter_count") if session_message else None,
        "epoch": metrics_message.get("epoch"),
        "total_loss": metrics_message.get("total_loss"),
        "pde_loss": metrics_message.get("pde_loss"),
        "bc_loss": metrics_message.get("bc_loss"),
        "teacher_loss": metrics_message.get("teacher_loss"),
        "error_mae": error_stats["mae"],
        "error_rmse": error_stats["rmse"],
        "error_rel_l2": error_stats["rel_l2"],
        "error_p95": error_stats["p95"],
        "error_max": error_stats["max"],
        "peak_vm_pinn": error_stats["peak_pinn"],
        "peak_vm_fem": error_stats["peak_fem"],
        "peak_vm_ratio": error_stats["peak_ratio"],
        "history_tail": metrics_message.get("history_tail"),
        "tutor_controls": training_config_to_tutor_controls(config),
        "training_config": config.model_dump(mode="json"),
    }


def last_message(messages: Iterable[dict[str, Any]], message_type: str) -> dict[str, Any] | None:
    for message in reversed(list(messages)):
        if message.get("type") == message_type:
            return message
    return None


def grid_to_numpy(grid: dict[str, Any]) -> np.ndarray:
    rows = grid.get("z") or []
    return np.array(
        [[np.nan if value is None else float(value) for value in row] for row in rows],
        dtype=np.float32,
    )


def summarize_error_arrays(pred: np.ndarray, fem: np.ndarray, err: np.ndarray) -> dict[str, float]:
    mask = np.isfinite(pred) & np.isfinite(fem) & np.isfinite(err)
    if not np.any(mask):
        raise RuntimeError("No finite FEM/PINN overlap was available for comparison.")

    pred_valid = pred[mask]
    fem_valid = fem[mask]
    err_valid = err[mask]

    rmse = float(np.sqrt(np.mean((pred_valid - fem_valid) ** 2)))
    denom = float(np.linalg.norm(fem_valid))
    rel_l2 = float(np.linalg.norm(pred_valid - fem_valid) / denom) if denom > 1e-12 else math.inf
    peak_fem = float(np.max(np.abs(fem_valid)))
    peak_pinn = float(np.max(np.abs(pred_valid)))
    peak_ratio = float(peak_pinn / peak_fem) if peak_fem > 1e-12 else math.inf

    return {
        "mae": float(np.mean(err_valid)),
        "rmse": rmse,
        "rel_l2": rel_l2,
        "p95": float(np.quantile(err_valid, 0.95)),
        "max": float(np.max(err_valid)),
        "peak_pinn": peak_pinn,
        "peak_fem": peak_fem,
        "peak_ratio": peak_ratio,
    }


def training_config_to_tutor_controls(config: TrainingConfig) -> dict[str, Any]:
    return {
        "geometry": config.problem.geometry.geometry,
        "frameThickness": format_float(config.problem.geometry.frame_thickness),
        "braceHalfWidth": format_float(config.problem.geometry.brace_half_width, digits=3),
        "patchCenter": format_float(config.problem.load.patch_center),
        "patchWidth": format_float(config.problem.load.patch_width),
        "young": str(int(config.problem.material.young)),
        "poisson": format_float(config.problem.material.poisson, digits=2),
        "samplingStrategy": config.sampling_strategy,
        "nDomain": str(config.n_domain),
        "nBoundary": str(config.n_boundary),
        "epochs": str(config.epochs),
        "normalizeInputs": bool(config.normalize_inputs),
        "hiddenDim": str(config.hidden_dim),
        "nHiddenLayers": str(config.n_hidden_layers),
        "pdeWeight": format_float(config.pde_weight, digits=1),
        "bcWeight": format_float(config.bc_weight, digits=1),
        "residualResampleEvery": str(config.residual_resample_every),
        "fourierFeatures": bool(config.fourier_features),
        "fourierSigma": format_float(config.fourier_sigma, digits=1),
        "teacherInterior": str(config.teacher.n_interior),
        "teacherBoundary": str(config.teacher.n_boundary),
        "teacherLoadPatch": str(config.teacher.n_load_patch),
        "teacherWeight": format_float(config.teacher.weight, digits=1),
    }


def format_float(value: float, *, digits: int = 2) -> str:
    return f"{float(value):.{digits}f}"


def filter_cases(cases: list[CandidateCase], geometries: list[str], filters: list[str]) -> list[CandidateCase]:
    selected = [case for case in cases if case.geometry in geometries]
    if not filters:
        return selected

    lowered = [item.lower() for item in filters]
    return [
        case
        for case in selected
        if any(fragment in f"{case.name} {case.description}".lower() for fragment in lowered)
    ]


async def run_sweep(cases: list[CandidateCase], *, epochs: int, stress_grid_n: int, seed: int) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for index, case in enumerate(cases, start=1):
        print(f"[{index}/{len(cases)}] Running {case.name} ({case.description})")
        result = await run_case(case, epochs=epochs, stress_grid_n=stress_grid_n, seed=seed)
        results.append(result)
        print(
            "    "
            f"rel_l2={result['error_rel_l2']:.4f} "
            f"mae={result['error_mae']:.4f} "
            f"rmse={result['error_rmse']:.4f} "
            f"peak_ratio={result['peak_vm_ratio']:.3f} "
            f"duration={result['duration_sec']:.1f}s"
        )
    return results


def print_summary(results: list[dict[str, Any]]) -> None:
    if not results:
        print("No sweep results to summarize.")
        return

    print("\nBest candidate by geometry:")
    for geometry in GEOMETRIES:
        group = [result for result in results if result["geometry"] == geometry]
        if not group:
            continue
        best = min(group, key=lambda item: (item["error_rel_l2"], item["error_rmse"]))
        print(
            f"- {geometry}: {best['name']} "
            f"(rel_l2={best['error_rel_l2']:.4f}, mae={best['error_mae']:.4f}, rmse={best['error_rmse']:.4f})"
        )

    print("\nOverall ranking:")
    ranked = sorted(results, key=lambda item: (item["error_rel_l2"], item["error_rmse"]))
    for idx, result in enumerate(ranked, start=1):
        print(
            f"{idx:>2}. {result['name']:<48} "
            f"rel_l2={result['error_rel_l2']:.4f} "
            f"mae={result['error_mae']:.4f} "
            f"rmse={result['error_rmse']:.4f} "
            f"peak_ratio={result['peak_vm_ratio']:.3f}"
        )


def write_results(path: Path, results: list[dict[str, Any]], *, epochs: int, stress_grid_n: int, seed: int) -> None:
    payload = {
        "epochs": epochs,
        "stress_grid_n": stress_grid_n,
        "seed": seed,
        "results": results,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2))
    print(f"\nSaved detailed results to {path}")


def main() -> None:
    args = parse_args()
    cases = build_candidate_cases(args.epochs)
    selected = filter_cases(cases, args.geometries, args.case_filter)

    if args.list_cases:
        for case in selected:
            print(f"{case.name}: {case.description}")
        return

    if not selected:
        raise SystemExit("No candidate cases matched the selected filters.")

    results = asyncio.run(
        run_sweep(
            selected,
            epochs=args.epochs,
            stress_grid_n=args.stress_grid_n,
            seed=args.seed,
        )
    )
    print_summary(results)
    if args.output is not None:
        write_results(args.output, results, epochs=args.epochs, stress_grid_n=args.stress_grid_n, seed=args.seed)


if __name__ == "__main__":
    main()