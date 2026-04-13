"""Static 2D plane-stress FEM solve and post-processing."""

from __future__ import annotations

from time import perf_counter
from typing import Any

import numpy as np
from scipy.interpolate import griddata
from skfem import Basis, ElementTriP1, ElementVector, FacetBasis, LinearForm, asm, condense, solve
from skfem.models.elasticity import lame_parameters, linear_elasticity, plane_stress

from pinn_playground.backend.fem_geometry import (
    OUTER_HI,
    OUTER_LO,
    build_structured_frame_mesh,
    domain_mask_np,
    serialize_boundary_payload,
    serialize_mesh_payload,
    top_load_facets,
)
from pinn_playground.backend.problem_definition import FEMProblemConfig


def solve_fem_problem(config: FEMProblemConfig, *, grid_n: int = 60) -> dict[str, Any]:
    """Assemble, solve, and serialize a lightweight FEM baseline."""
    mesh = build_structured_frame_mesh(config)
    element = ElementVector(ElementTriP1())
    basis = Basis(mesh, element)

    effective_young, effective_poisson = plane_stress(
        config.material.young,
        config.material.poisson,
    )
    lam, mu = lame_parameters(effective_young, effective_poisson)

    t0 = perf_counter()
    stiffness = asm(linear_elasticity(lam, mu), basis)
    load_facets = top_load_facets(mesh, config)
    facet_basis = FacetBasis(mesh, element, facets=load_facets)

    traction_x = float(config.load.traction_x)
    traction_y = float(config.load.traction_y)

    @LinearForm
    def loading(v, _w):
        return traction_x * v[0] + traction_y * v[1]

    rhs = asm(loading, facet_basis)
    fixed_dofs = basis.get_dofs(config.support.fixed_edge).all()
    solution = solve(*condense(stiffness, rhs, D=fixed_dofs))
    solve_time_ms = 1000.0 * (perf_counter() - t0)

    ux = np.asarray(solution[basis.nodal_dofs[0]], dtype=np.float64)
    uy = np.asarray(solution[basis.nodal_dofs[1]], dtype=np.float64)
    displacement_mag = np.sqrt(ux**2 + uy**2)

    element_vm, element_sxx, element_syy, element_txy = _element_stresses(mesh, ux, uy, config)
    stress_grid = _stress_grid(mesh, element_vm, config, grid_n=grid_n)
    deformed_mesh, deformation_scale = _deformed_mesh_payload(mesh, ux, uy)

    return {
        "type": "fem_solve",
        "case_id": config.case_id(),
        "geometry": config.geometry.model_dump(),
        "support": config.support.model_dump(),
        "load": config.load.model_dump(),
        "mesh": serialize_mesh_payload(mesh),
        "boundaries": serialize_boundary_payload(mesh, config),
        "deformed_mesh": deformed_mesh,
        "stress_grid": stress_grid,
        "summary": {
            "solve_time_ms": round(solve_time_ms, 3),
            "max_displacement": float(np.max(displacement_mag)),
            "max_von_mises": float(np.max(element_vm)),
            "mean_von_mises": float(np.mean(element_vm)),
            "deformation_scale": float(deformation_scale),
            "n_load_facets": int(load_facets.size),
            "max_abs_sxx": float(np.max(np.abs(element_sxx))),
            "max_abs_syy": float(np.max(np.abs(element_syy))),
            "max_abs_txy": float(np.max(np.abs(element_txy))),
        },
    }


def _element_stresses(
    mesh,
    ux: np.ndarray,
    uy: np.ndarray,
    config: FEMProblemConfig,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    triangles = mesh.t.T
    points = mesh.p.T

    young = float(config.material.young)
    poisson = float(config.material.poisson)
    constitutive = young / (1.0 - poisson * poisson) * np.array(
        [
            [1.0, poisson, 0.0],
            [poisson, 1.0, 0.0],
            [0.0, 0.0, 0.5 * (1.0 - poisson)],
        ],
        dtype=np.float64,
    )

    sxx = np.zeros(triangles.shape[0], dtype=np.float64)
    syy = np.zeros(triangles.shape[0], dtype=np.float64)
    txy = np.zeros(triangles.shape[0], dtype=np.float64)

    for idx, tri in enumerate(triangles):
        tri_points = points[tri]
        x1, y1 = tri_points[0]
        x2, y2 = tri_points[1]
        x3, y3 = tri_points[2]

        area2 = (x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1)
        if np.isclose(area2, 0.0):
            continue

        b1, b2, b3 = y2 - y3, y3 - y1, y1 - y2
        c1, c2, c3 = x3 - x2, x1 - x3, x2 - x1
        b_matrix = (1.0 / area2) * np.array(
            [
                [b1, 0.0, b2, 0.0, b3, 0.0],
                [0.0, c1, 0.0, c2, 0.0, c3],
                [c1, b1, c2, b2, c3, b3],
            ],
            dtype=np.float64,
        )
        local_u = np.array(
            [
                ux[tri[0]],
                uy[tri[0]],
                ux[tri[1]],
                uy[tri[1]],
                ux[tri[2]],
                uy[tri[2]],
            ],
            dtype=np.float64,
        )
        strain = b_matrix @ local_u
        stress = constitutive @ strain
        sxx[idx], syy[idx], txy[idx] = stress

    von_mises = np.sqrt(sxx**2 - sxx * syy + syy**2 + 3.0 * txy**2)
    return von_mises, sxx, syy, txy


def _stress_grid(mesh, element_vm: np.ndarray, config: FEMProblemConfig, *, grid_n: int) -> dict[str, Any]:
    xs = np.linspace(OUTER_LO, OUTER_HI, grid_n, dtype=np.float64)
    ys = np.linspace(OUTER_LO, OUTER_HI, grid_n, dtype=np.float64)
    grid_x, grid_y = np.meshgrid(xs, ys, indexing="xy")

    centroids = mesh.p[:, mesh.t].mean(axis=1).T
    linear = griddata(centroids, element_vm, (grid_x, grid_y), method="linear")
    nearest = griddata(centroids, element_vm, (grid_x, grid_y), method="nearest")
    values = np.where(np.isfinite(linear), linear, nearest)
    mask = domain_mask_np(grid_x, grid_y, config.geometry)
    values = np.where(mask, values, np.nan)

    return {
        "x": [float(v) for v in xs.tolist()],
        "y": [float(v) for v in ys.tolist()],
        "z": [
            [None if not np.isfinite(value) else float(value) for value in row]
            for row in values.tolist()
        ],
    }


def _deformed_mesh_payload(mesh, ux: np.ndarray, uy: np.ndarray) -> tuple[dict[str, Any], float]:
    max_disp = float(np.max(np.sqrt(ux**2 + uy**2)))
    if max_disp <= 1e-18:
        scale = 1.0
    else:
        scale = min(max(0.12 / max_disp, 1.0), 2.5e6)

    deformed_x = mesh.p[0] + scale * ux
    deformed_y = mesh.p[1] + scale * uy

    return (
        {
            "scale": float(scale),
            "points": {
                "x": [float(v) for v in mesh.p[0].tolist()],
                "y": [float(v) for v in mesh.p[1].tolist()],
            },
            "deformed_points": {
                "x": [float(v) for v in deformed_x.tolist()],
                "y": [float(v) for v in deformed_y.tolist()],
            },
            "triangles": {
                "i": [int(v) for v in mesh.t[0].tolist()],
                "j": [int(v) for v in mesh.t[1].tolist()],
                "k": [int(v) for v in mesh.t[2].tolist()],
            },
            "displacement_magnitude": [float(v) for v in np.sqrt(ux**2 + uy**2).tolist()],
        },
        scale,
    )
