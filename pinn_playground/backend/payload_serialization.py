from __future__ import annotations

from typing import Any

import numpy as np


def deformation_visual_scale(u_values: np.ndarray, v_values: np.ndarray) -> float:
    displacement_mag = np.sqrt(np.asarray(u_values) ** 2 + np.asarray(v_values) ** 2)
    finite_magnitudes = displacement_mag[np.isfinite(displacement_mag)]
    if finite_magnitudes.size == 0:
        return 1.0
    max_displacement = float(np.max(finite_magnitudes))
    if max_displacement <= 1e-18:
        return 1.0
    return float(min(max(0.12 / max_displacement, 1.0), 2.5e6))


def serialize_displacement_grid(
    x: np.ndarray,
    y: np.ndarray,
    u: np.ndarray,
    v: np.ndarray,
) -> dict[str, Any]:
    valid = np.isfinite(u) & np.isfinite(v)
    u = np.where(valid, u, np.nan).astype(np.float32)
    v = np.where(valid, v, np.nan).astype(np.float32)
    magnitude = np.sqrt(u**2 + v**2).astype(np.float32)
    scale = deformation_visual_scale(u, v)

    def rows(values: np.ndarray) -> list[list[float | None]]:
        out: list[list[float | None]] = []
        for row in values.tolist():
            out.append([None if value is None or not np.isfinite(value) else float(value) for value in row])
        return out

    return {
        "x": [float(value) for value in x[0, :].tolist()],
        "y": [float(value) for value in y[:, 0].tolist()],
        "u": rows(u),
        "v": rows(v),
        "magnitude": rows(magnitude),
        "scale": scale,
    }
