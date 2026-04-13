"""Programmatic FEM geometry and preview helpers for the numerical playground."""

from __future__ import annotations

from typing import Any

import numpy as np
from skfem import MeshTri

from pinn_playground.backend.problem_definition import FEMGeometryConfig, FEMProblemConfig

OUTER_LO = 0.0
OUTER_HI = 1.0


def _point_segment_distance_np(
    px: np.ndarray,
    py: np.ndarray,
    ax: float,
    ay: float,
    bx: float,
    by: float,
) -> np.ndarray:
    """Distance from many points to a line segment."""
    abx = bx - ax
    aby = by - ay
    apx = px - ax
    apy = py - ay
    ab_len2 = abx * abx + aby * aby + 1e-16
    t = np.clip((apx * abx + apy * aby) / ab_len2, 0.0, 1.0)
    qx = ax + t * abx
    qy = ay + t * aby
    return np.sqrt((px - qx) ** 2 + (py - qy) ** 2)


def frame_mask_np(x: np.ndarray, y: np.ndarray, geometry: FEMGeometryConfig) -> np.ndarray:
    """Solid frame: inside outer square, outside the centered opening."""
    outer = (x >= OUTER_LO) & (x <= OUTER_HI) & (y >= OUTER_LO) & (y <= OUTER_HI)
    hole = (
        (x > geometry.inner_lo)
        & (x < geometry.inner_hi)
        & (y > geometry.inner_lo)
        & (y < geometry.inner_hi)
    )
    return outer & ~hole


def brace_mask_np(x: np.ndarray, y: np.ndarray, geometry: FEMGeometryConfig) -> np.ndarray:
    """Finite-width reinforcement bands spanning the opening."""
    if geometry.geometry == "base":
        return np.zeros_like(x, dtype=bool)

    d1 = _point_segment_distance_np(
        x,
        y,
        geometry.inner_lo,
        geometry.inner_lo,
        geometry.inner_hi,
        geometry.inner_hi,
    )
    mask = d1 <= geometry.brace_half_width

    if geometry.geometry == "diagonal":
        return mask

    d2 = _point_segment_distance_np(
        x,
        y,
        geometry.inner_lo,
        geometry.inner_hi,
        geometry.inner_hi,
        geometry.inner_lo,
    )
    return mask | (d2 <= geometry.brace_half_width)


def domain_mask_np(x: np.ndarray, y: np.ndarray, geometry: FEMGeometryConfig) -> np.ndarray:
    """Full solid domain for the structured-triangle mesh."""
    return frame_mask_np(x, y, geometry) | brace_mask_np(x, y, geometry)


def build_structured_frame_mesh(config: FEMProblemConfig) -> MeshTri:
    """Create a filtered triangular mesh for the frame geometry."""
    n_nodes = config.mesh.n_cells + 1
    grid = np.linspace(OUTER_LO, OUTER_HI, n_nodes, dtype=np.float64)
    base_mesh = MeshTri.init_tensor(grid, grid)

    centroids = base_mesh.p[:, base_mesh.t].mean(axis=1)
    keep = np.flatnonzero(domain_mask_np(centroids[0], centroids[1], config.geometry))
    if keep.size == 0:
        raise ValueError("No FEM elements remain after geometry filtering.")

    mesh = base_mesh.restrict(keep).remove_unused_nodes()
    tol = max(1e-9, 0.5 / config.mesh.n_cells)
    return mesh.with_boundaries(
        {
            "bottom": lambda x: np.isclose(x[1], OUTER_LO, atol=tol),
            "top": lambda x: np.isclose(x[1], OUTER_HI, atol=tol),
            "left": lambda x: np.isclose(x[0], OUTER_LO, atol=tol),
            "right": lambda x: np.isclose(x[0], OUTER_HI, atol=tol),
        }
    )


def top_load_facets(mesh: MeshTri, config: FEMProblemConfig) -> np.ndarray:
    """Select the top-edge traction patch from already tagged outer-edge facets."""
    top = np.asarray(mesh.boundaries.get("top", np.array([], dtype=int)), dtype=int)
    if top.size == 0:
        return top

    mids = _facet_midpoints(mesh, top)
    x_min = config.load.x_min
    x_max = config.load.x_max
    tol = max(1e-9, 0.5 / config.mesh.n_cells)
    mask = (mids[0] >= x_min - tol) & (mids[0] <= x_max + tol)
    load_facets = top[mask]

    # Keep the preview stable even for coarse meshes or narrow patches.
    if load_facets.size == 0:
        nearest = int(np.argmin(np.abs(mids[0] - config.load.patch_center)))
        load_facets = top[[nearest]]

    return load_facets


def build_fem_preview_payload(config: FEMProblemConfig) -> dict[str, Any]:
    """Serialize a mesh preview payload for the future numerical GUI."""
    mesh = build_structured_frame_mesh(config)

    return {
        "type": "fem_preview",
        "case_id": config.case_id(),
        "geometry": config.geometry.model_dump(),
        "support": config.support.model_dump(),
        "load": config.load.model_dump(),
        "mesh": serialize_mesh_payload(mesh),
        "boundaries": serialize_boundary_payload(mesh, config),
    }


def serialize_mesh_payload(mesh: MeshTri) -> dict[str, Any]:
    """Serialize a triangular mesh into plot-friendly arrays."""
    boundary_all = np.asarray(mesh.boundary_facets(), dtype=int)
    return {
        "points": {
            "x": [float(v) for v in mesh.p[0].tolist()],
            "y": [float(v) for v in mesh.p[1].tolist()],
        },
        "triangles": {
            "i": [int(v) for v in mesh.t[0].tolist()],
            "j": [int(v) for v in mesh.t[1].tolist()],
            "k": [int(v) for v in mesh.t[2].tolist()],
        },
        "counts": {
            "n_nodes": int(mesh.p.shape[1]),
            "n_elements": int(mesh.t.shape[1]),
            "n_boundary_facets": int(boundary_all.size),
        },
    }


def serialize_boundary_payload(mesh: MeshTri, config: FEMProblemConfig) -> dict[str, Any]:
    """Serialize key boundary groups shared by FEM preview and solve routes."""
    top_load = top_load_facets(mesh, config)
    boundary_all = np.asarray(mesh.boundary_facets(), dtype=int)
    outer_facets = np.unique(
        np.concatenate(
            [
                np.asarray(mesh.boundaries.get("bottom", np.array([], dtype=int)), dtype=int),
                np.asarray(mesh.boundaries.get("top", np.array([], dtype=int)), dtype=int),
                np.asarray(mesh.boundaries.get("left", np.array([], dtype=int)), dtype=int),
                np.asarray(mesh.boundaries.get("right", np.array([], dtype=int)), dtype=int),
            ]
        )
    )
    internal_boundary = np.setdiff1d(boundary_all, outer_facets, assume_unique=False)
    top_free = np.setdiff1d(
        np.asarray(mesh.boundaries.get("top", np.array([], dtype=int)), dtype=int),
        top_load,
        assume_unique=False,
    )

    return {
        "bottom_support": _serialize_segments(
            mesh, np.asarray(mesh.boundaries.get("bottom", np.array([], dtype=int)), dtype=int)
        ),
        "top_load": _serialize_segments(mesh, top_load),
        "top_free": _serialize_segments(mesh, top_free),
        "outer_left": _serialize_segments(
            mesh, np.asarray(mesh.boundaries.get("left", np.array([], dtype=int)), dtype=int)
        ),
        "outer_right": _serialize_segments(
            mesh, np.asarray(mesh.boundaries.get("right", np.array([], dtype=int)), dtype=int)
        ),
        "internal": _serialize_segments(mesh, internal_boundary),
    }


def _facet_midpoints(mesh: MeshTri, facets: np.ndarray) -> np.ndarray:
    if facets.size == 0:
        return np.zeros((2, 0), dtype=np.float64)
    return mesh.p[:, mesh.facets[:, facets]].mean(axis=1)


def _serialize_segments(mesh: MeshTri, facets: np.ndarray) -> dict[str, list[float | None]]:
    xs: list[float | None] = []
    ys: list[float | None] = []
    for facet in np.asarray(facets, dtype=int).tolist():
        nodes = mesh.facets[:, facet]
        points = mesh.p[:, nodes]
        xs.extend([float(points[0, 0]), float(points[0, 1]), None])
        ys.extend([float(points[1, 0]), float(points[1, 1]), None])
    return {"x": xs, "y": ys}
