"""
2D square frame geometry, collocation sampling, and plane-stress linear elasticity.

The baseline domain is a unit square [0,1]^2 with a centered square hole (the frame).
Optional reinforcements add thin diagonal bands across the opening (diagonal or X-brace).
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Literal

import numpy as np
import torch

from pinn_playground.backend.problem_definition import StructuralGeometryConfig, StructuralProblemConfig

# ---------------------------------------------------------------------------
# Geometry parameters (normalized coordinates)
# ---------------------------------------------------------------------------

OUTER_LO = 0.0
OUTER_HI = 1.0
DEFAULT_GEOMETRY = StructuralGeometryConfig()


class GeometryType(str, Enum):
    """Reinforcement layout (same outer frame + hole for all)."""

    BASE = "base"
    DIAGONAL = "diagonal"
    X_BRACE = "x_brace"


SamplingStrategy = Literal["uniform", "adaptive"]


@dataclass(frozen=True)
class MaterialProps:
    """Plane-stress isotropic linear elastic material."""

    young: float = 1.0  # nondimensional for stable PINN training
    poisson: float = 0.3

    @property
    def lame_mu(self) -> float:
        return self.young / (2.0 * (1.0 + self.poisson))

    @property
    def lame_lambda_plane_stress(self) -> float:
        """Effective λ for plane-stress σ_zz=0 (in-plane stress–strain)."""
        nu = self.poisson
        e = self.young
        return e * nu / (1.0 - nu * nu)


# ---------------------------------------------------------------------------
# Distance: point — line segment (NumPy, broadcast-safe)
# ---------------------------------------------------------------------------


def _point_segment_distance_np(
    px: np.ndarray,
    py: np.ndarray,
    ax: float,
    ay: float,
    bx: float,
    by: float,
) -> np.ndarray:
    abx = bx - ax
    aby = by - ay
    apx = px - ax
    apy = py - ay
    ab_len2 = abx * abx + aby * aby + 1e-16
    t = np.clip((apx * abx + apy * aby) / ab_len2, 0.0, 1.0)
    qx = ax + t * abx
    qy = ay + t * aby
    return np.sqrt((px - qx) ** 2 + (py - qy) ** 2)


def _point_segment_distance_torch(
    px: torch.Tensor,
    py: torch.Tensor,
    ax: float,
    ay: float,
    bx: float,
    by: float,
) -> torch.Tensor:
    abx = bx - ax
    aby = by - ay
    apx = px - ax
    apy = py - ay
    ab_len2 = abx * abx + aby * aby + 1e-16
    t = torch.clamp((apx * abx + apy * aby) / ab_len2, 0.0, 1.0)
    qx = ax + t * abx
    qy = ay + t * aby
    return torch.sqrt((px - qx) ** 2 + (py - qy) ** 2 + 1e-16)


# ---------------------------------------------------------------------------
# Domain masks
# ---------------------------------------------------------------------------


def _coerce_geometry_config(
    geometry: StructuralProblemConfig | StructuralGeometryConfig | GeometryType | str,
) -> StructuralGeometryConfig:
    if isinstance(geometry, StructuralProblemConfig):
        return geometry.geometry
    if isinstance(geometry, StructuralGeometryConfig):
        return geometry
    if isinstance(geometry, GeometryType):
        return StructuralGeometryConfig(geometry=geometry.value)
    return StructuralGeometryConfig(geometry=geometry)


def frame_mask_np(
    x: np.ndarray,
    y: np.ndarray,
    geometry: StructuralProblemConfig | StructuralGeometryConfig | GeometryType | str = DEFAULT_GEOMETRY,
) -> np.ndarray:
    """Solid frame: inside outer square, outside inner hole."""
    geometry_config = _coerce_geometry_config(geometry)
    outer = (x >= OUTER_LO) & (x <= OUTER_HI) & (y >= OUTER_LO) & (y <= OUTER_HI)
    hole = (
        (x > geometry_config.inner_lo)
        & (x < geometry_config.inner_hi)
        & (y > geometry_config.inner_lo)
        & (y < geometry_config.inner_hi)
    )
    return outer & ~hole


def brace_band_mask_np(
    x: np.ndarray,
    y: np.ndarray,
    geometry: StructuralProblemConfig | StructuralGeometryConfig | GeometryType | str,
) -> np.ndarray:
    """Thin bands across the opening (diagonal / X)."""
    geometry_config = _coerce_geometry_config(geometry)
    geometry_kind = GeometryType(geometry_config.geometry)

    if geometry_kind == GeometryType.BASE:
        return np.zeros_like(x, dtype=bool)

    d1 = _point_segment_distance_np(
        x,
        y,
        geometry_config.inner_lo,
        geometry_config.inner_lo,
        geometry_config.inner_hi,
        geometry_config.inner_hi,
    )
    m = d1 <= geometry_config.brace_half_width

    if geometry_kind == GeometryType.DIAGONAL:
        return m

    # X-brace: second diagonal
    d2 = _point_segment_distance_np(
        x,
        y,
        geometry_config.inner_lo,
        geometry_config.inner_hi,
        geometry_config.inner_hi,
        geometry_config.inner_lo,
    )
    return m | (d2 <= geometry_config.brace_half_width)


def geometry_mask_np(
    x: np.ndarray,
    y: np.ndarray,
    geometry: StructuralProblemConfig | StructuralGeometryConfig | GeometryType | str,
) -> np.ndarray:
    """Full 2D domain mask for collocation."""
    geometry_config = _coerce_geometry_config(geometry)
    return frame_mask_np(x, y, geometry_config) | brace_band_mask_np(x, y, geometry_config)


def geometry_mask_torch(
    x: torch.Tensor,
    y: torch.Tensor,
    geometry: StructuralProblemConfig | StructuralGeometryConfig | GeometryType | str,
) -> torch.Tensor:
    """Same as `geometry_mask_np` for torch tensors (differentiable w.r.t. x,y not required)."""
    geometry_config = _coerce_geometry_config(geometry)
    g = GeometryType(geometry_config.geometry)
    outer = (x >= OUTER_LO) & (x <= OUTER_HI) & (y >= OUTER_LO) & (y <= OUTER_HI)
    hole = (
        (x > geometry_config.inner_lo)
        & (x < geometry_config.inner_hi)
        & (y > geometry_config.inner_lo)
        & (y < geometry_config.inner_hi)
    )
    frame = outer & ~hole

    if g == GeometryType.BASE:
        return frame

    d1 = _point_segment_distance_torch(
        x,
        y,
        geometry_config.inner_lo,
        geometry_config.inner_lo,
        geometry_config.inner_hi,
        geometry_config.inner_hi,
    )
    band1 = d1 <= geometry_config.brace_half_width
    if g == GeometryType.DIAGONAL:
        return frame | band1
    d2 = _point_segment_distance_torch(
        x,
        y,
        geometry_config.inner_lo,
        geometry_config.inner_hi,
        geometry_config.inner_hi,
        geometry_config.inner_lo,
    )
    band2 = d2 <= geometry_config.brace_half_width
    return frame | band1 | band2


# ---------------------------------------------------------------------------
# Adaptive sampling weights (hotspots: inner corners + brace junctions)
# ---------------------------------------------------------------------------


def _hotspots_xy(
    geometry: StructuralProblemConfig | StructuralGeometryConfig | GeometryType | str,
) -> list[tuple[float, float]]:
    geometry_config = _coerce_geometry_config(geometry)
    geometry_kind = GeometryType(geometry_config.geometry)
    corners = [
        (geometry_config.inner_lo, geometry_config.inner_lo),
        (geometry_config.inner_hi, geometry_config.inner_lo),
        (geometry_config.inner_lo, geometry_config.inner_hi),
        (geometry_config.inner_hi, geometry_config.inner_hi),
    ]
    if geometry_kind == GeometryType.BASE:
        return corners
    # Brace endpoints lie on inner corners already; add mid-opening for emphasis
    mid = 0.5 * (geometry_config.inner_lo + geometry_config.inner_hi)
    if geometry_kind == GeometryType.DIAGONAL:
        return corners + [(mid, mid)]
    return corners + [(mid, mid), (mid, mid)]


def _min_dist_to_hotspots_np(
    x: np.ndarray,
    y: np.ndarray,
    geometry: StructuralProblemConfig | StructuralGeometryConfig | GeometryType | str,
) -> np.ndarray:
    pts = _hotspots_xy(geometry)
    d = np.minimum.reduce(
        [np.sqrt((x - hx) ** 2 + (y - hy) ** 2) for hx, hy in pts]
    )
    return d


def sample_domain_points(
    n_points: int,
    geometry: StructuralProblemConfig | StructuralGeometryConfig | GeometryType | str,
    strategy: SamplingStrategy = "uniform",
    *,
    seed: int | None = 0,
    pool_factor: int = 8,
    adaptive_power: float = 1.5,
    adaptive_floor: float = 0.02,
) -> np.ndarray:
    """
    Sample `n_points` collocation locations inside the domain.

    Returns an array of shape (n_points, 2) with columns [x, y] in [0,1]^2.
    """
    if n_points <= 0:
        return np.zeros((0, 2), dtype=np.float32)

    geometry_config = _coerce_geometry_config(geometry)
    rng = np.random.default_rng(seed)

    if strategy == "uniform":
        return _sample_uniform_filtered(n_points, geometry_config, rng)

    return _sample_adaptive_weighted(
        n_points,
        geometry_config,
        rng,
        pool_factor=pool_factor,
        power=adaptive_power,
        floor=adaptive_floor,
    )


def _sample_uniform_filtered(
    n: int,
    geometry: StructuralGeometryConfig,
    rng: np.random.Generator,
) -> np.ndarray:
    """Rejection sampling from uniform [0,1]^2 until n points inside domain."""
    out: list[np.ndarray] = []
    remaining = n
    batch = max(remaining * 4, 256)
    while remaining > 0:
        xs = rng.random(batch)
        ys = rng.random(batch)
        m = geometry_mask_np(xs, ys, geometry)
        sel = np.stack([xs[m], ys[m]], axis=1)
        if sel.shape[0] == 0:
            batch *= 2
            continue
        take = min(remaining, sel.shape[0])
        out.append(sel[:take])
        remaining -= take
    return np.concatenate(out, axis=0).astype(np.float32)


def _sample_adaptive_weighted(
    n: int,
    geometry: StructuralGeometryConfig,
    rng: np.random.Generator,
    *,
    pool_factor: int,
    power: float,
    floor: float,
) -> np.ndarray:
    """Draw a large candidate pool, weight by proximity to hotspots, sample without replacement."""
    pool = max(n * pool_factor, 512)
    xs = rng.random(pool)
    ys = rng.random(pool)
    m = geometry_mask_np(xs, ys, geometry)
    xs, ys = xs[m], ys[m]
    if xs.size < n:
        # Fallback if mask is pathological
        return _sample_uniform_filtered(n, geometry, rng)

    d = _min_dist_to_hotspots_np(xs, ys, geometry)
    w = 1.0 / (np.power(d + floor, power))
    w /= w.sum()
    idx = rng.choice(xs.size, size=n, replace=False, p=w)
    return np.stack([xs[idx], ys[idx]], axis=1).astype(np.float32)


# ---------------------------------------------------------------------------
# Boundary sampling (outer square + inner hole edges)
# ---------------------------------------------------------------------------


def sample_boundary_points(
    n_per_edge: int,
    geometry: StructuralProblemConfig | StructuralGeometryConfig | GeometryType | str,
    *,
    seed: int | None = 0,
    include_brace_surface: bool = True,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """
    Sample boundary points for BC loss.

    Returns ``(x, y, nx, ny)`` each 1D float32 array of length N: coordinates and outward unit normals
    (approximate for outer box / inner hole; brace cut faces use short-segment normals).
    """
    geometry_config = _coerce_geometry_config(geometry)
    g = GeometryType(geometry_config.geometry)
    rng = np.random.default_rng(seed)
    xs: list[float] = []
    ys: list[float] = []
    nxs: list[float] = []
    nys: list[float] = []

    def add_edge_vertical(x_const: float, y0: float, y1: float, nx: float, ny: float) -> None:
        if n_per_edge <= 0:
            return
        t = rng.uniform(y0, y1, size=n_per_edge)
        xs.extend([x_const] * n_per_edge)
        ys.extend(t.tolist())
        nxs.extend([nx] * n_per_edge)
        nys.extend([ny] * n_per_edge)

    def add_edge_horizontal(y_const: float, x0: float, x1: float, nx: float, ny: float) -> None:
        if n_per_edge <= 0:
            return
        t = rng.uniform(x0, x1, size=n_per_edge)
        ys.extend([y_const] * n_per_edge)
        xs.extend(t.tolist())
        nxs.extend([nx] * n_per_edge)
        nys.extend([ny] * n_per_edge)

    # Outer boundary (outward normals)
    add_edge_vertical(OUTER_LO, OUTER_LO, OUTER_HI, -1.0, 0.0)
    add_edge_vertical(OUTER_HI, OUTER_LO, OUTER_HI, 1.0, 0.0)
    add_edge_horizontal(OUTER_LO, OUTER_LO, OUTER_HI, 0.0, -1.0)
    add_edge_horizontal(OUTER_HI, OUTER_LO, OUTER_HI, 0.0, 1.0)

    # Inner hole (normals point into void = outward from solid)
    add_edge_vertical(geometry_config.inner_lo, geometry_config.inner_lo, geometry_config.inner_hi, 1.0, 0.0)
    add_edge_vertical(geometry_config.inner_hi, geometry_config.inner_lo, geometry_config.inner_hi, -1.0, 0.0)
    add_edge_horizontal(geometry_config.inner_lo, geometry_config.inner_lo, geometry_config.inner_hi, 0.0, 1.0)
    add_edge_horizontal(geometry_config.inner_hi, geometry_config.inner_lo, geometry_config.inner_hi, 0.0, -1.0)

    if include_brace_surface and g != GeometryType.BASE:
        # Sample along brace centerlines; normals perpendicular to brace in 2D
        n_seg = max(1, n_per_edge // 2)

        def add_sloped_segment(ax: float, ay: float, bx: float, by: float) -> None:
            dx, dy = bx - ax, by - ay
            length = float(np.hypot(dx, dy)) + 1e-12
            tx, ty = dx / length, dy / length
            # perpendicular (outward from solid on one side — consistent choice)
            nx_, ny_ = ty, -tx
            ts = rng.uniform(0.0, 1.0, size=n_seg)
            for t in ts:
                xs.append(ax + t * dx)
                ys.append(ay + t * dy)
                nxs.append(nx_)
                nys.append(ny_)

        add_sloped_segment(
            geometry_config.inner_lo,
            geometry_config.inner_lo,
            geometry_config.inner_hi,
            geometry_config.inner_hi,
        )
        if g == GeometryType.X_BRACE:
            add_sloped_segment(
                geometry_config.inner_lo,
                geometry_config.inner_hi,
                geometry_config.inner_hi,
                geometry_config.inner_lo,
            )

    return (
        np.asarray(xs, dtype=np.float32),
        np.asarray(ys, dtype=np.float32),
        np.asarray(nxs, dtype=np.float32),
        np.asarray(nys, dtype=np.float32),
    )


# ---------------------------------------------------------------------------
# Strains, stresses, equilibrium (PyTorch / autograd)
# ---------------------------------------------------------------------------


def strains_from_displacement(
    u: torch.Tensor,
    v: torch.Tensor,
    x: torch.Tensor,
    y: torch.Tensor,
) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    """Infinitesimal strains: ε_xx, ε_yy, γ_xy = 2ε_xy."""
    du_dx = torch.autograd.grad(
        u.sum(), x, create_graph=True, retain_graph=True, allow_unused=False
    )[0]
    du_dy = torch.autograd.grad(
        u.sum(), y, create_graph=True, retain_graph=True, allow_unused=False
    )[0]
    dv_dx = torch.autograd.grad(
        v.sum(), x, create_graph=True, retain_graph=True, allow_unused=False
    )[0]
    dv_dy = torch.autograd.grad(
        v.sum(), y, create_graph=True, retain_graph=True, allow_unused=False
    )[0]
    eps_xx = du_dx
    eps_yy = dv_dy
    gamma_xy = du_dy + dv_dx
    return eps_xx, eps_yy, gamma_xy


def stresses_plane_stress(
    eps_xx: torch.Tensor,
    eps_yy: torch.Tensor,
    gamma_xy: torch.Tensor,
    mat: MaterialProps | None = None,
) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    """
    σ_xx, σ_yy, τ_xy for plane stress (isotropic).

    σ_xx = C11 ε_xx + C12 ε_yy
    σ_yy = C12 ε_xx + C11 ε_yy
    τ_xy = G γ_xy
    with C11 = E/(1-ν²), C12 = νE/(1-ν²), G = E/(2(1+ν)).
    """
    m = mat or MaterialProps()
    e, nu = m.young, m.poisson
    c11 = e / (1.0 - nu * nu)
    c12 = nu * e / (1.0 - nu * nu)
    g = e / (2.0 * (1.0 + nu))
    sigma_xx = c11 * eps_xx + c12 * eps_yy
    sigma_yy = c12 * eps_xx + c11 * eps_yy
    tau_xy = g * gamma_xy
    return sigma_xx, sigma_yy, tau_xy


def equilibrium_residuals(
    sigma_xx: torch.Tensor,
    sigma_yy: torch.Tensor,
    tau_xy: torch.Tensor,
    x: torch.Tensor,
    y: torch.Tensor,
) -> tuple[torch.Tensor, torch.Tensor]:
    """
    Interior equilibrium: ∂σ_xx/∂x + ∂τ_xy/∂y = 0, ∂τ_xy/∂x + ∂σ_yy/∂y = 0.
    """
    dsxx_dx = torch.autograd.grad(
        sigma_xx.sum(), x, create_graph=True, retain_graph=True, allow_unused=False
    )[0]
    dsxx_dy = torch.autograd.grad(
        sigma_xx.sum(), y, create_graph=True, retain_graph=True, allow_unused=False
    )[0]
    dsyy_dx = torch.autograd.grad(
        sigma_yy.sum(), x, create_graph=True, retain_graph=True, allow_unused=False
    )[0]
    dsyy_dy = torch.autograd.grad(
        sigma_yy.sum(), y, create_graph=True, retain_graph=True, allow_unused=False
    )[0]
    dtau_dx = torch.autograd.grad(
        tau_xy.sum(), x, create_graph=True, retain_graph=True, allow_unused=False
    )[0]
    dtau_dy = torch.autograd.grad(
        tau_xy.sum(), y, create_graph=True, retain_graph=True, allow_unused=False
    )[0]
    rx = dsxx_dx + dtau_dy
    ry = dtau_dx + dsyy_dy
    return rx, ry


def von_mises_stress(
    sigma_xx: torch.Tensor,
    sigma_yy: torch.Tensor,
    tau_xy: torch.Tensor,
) -> torch.Tensor:
    """Plane-stress Von Mises equivalent stress."""
    return torch.sqrt(
        sigma_xx**2 - sigma_xx * sigma_yy + sigma_yy**2 + 3.0 * tau_xy**2 + 1e-16
    )


def pde_loss_domain(
    u: torch.Tensor,
    v: torch.Tensor,
    x: torch.Tensor,
    y: torch.Tensor,
    mat: MaterialProps | None = None,
) -> torch.Tensor:
    """Mean squared equilibrium residual over the batch."""
    eps_xx, eps_yy, gamma_xy = strains_from_displacement(u, v, x, y)
    sxx, syy, txy = stresses_plane_stress(eps_xx, eps_yy, gamma_xy, mat)
    rx, ry = equilibrium_residuals(sxx, syy, txy, x, y)
    return torch.mean(rx**2 + ry**2)


def bbox_for_normalization() -> tuple[float, float, float, float]:
    """Axis-aligned bounding box of the solid domain (outer square)."""
    return OUTER_LO, OUTER_HI, OUTER_LO, OUTER_HI


def numpy_to_domain_tensor(xy: np.ndarray, device: torch.device | None = None) -> tuple[torch.Tensor, torch.Tensor]:
    """Split (N,2) numpy array into requires_grad coordinate tensors."""
    t = torch.tensor(xy, dtype=torch.float32, device=device)
    x = t[:, 0:1].clone().detach().requires_grad_(True)
    y = t[:, 1:2].clone().detach().requires_grad_(True)
    return x, y
