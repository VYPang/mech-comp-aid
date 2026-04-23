"""
Compact MLP PINN: (x, y) -> (u, v) displacements with optional input normalization.
"""

from __future__ import annotations

import numpy as np
import torch
import torch.nn as nn

from pinn_playground.backend.physics_env import (
    MaterialProps,
    bbox_for_normalization,
    geometry_mask_np,
    strains_from_displacement,
    stresses_plane_stress,
    von_mises_stress,
)


class PINN(nn.Module):
    """
    Fully connected network with ``tanh`` activations (smooth for autograd).

    When ``normalize_inputs`` is True, coordinates are mapped from the outer
    bounding box to ``[-1, 1]`` per axis before the first layer.
    """

    def __init__(
        self,
        hidden_dim: int = 48,
        n_hidden_layers: int = 4,
        *,
        normalize_inputs: bool = True,
        fourier_features: bool = False,
        fourier_num_features: int = 32,
        fourier_sigma: float = 3.0,
        fourier_seed: int = 0,
    ) -> None:
        super().__init__()
        self.normalize_inputs = normalize_inputs
        self.fourier_features = fourier_features
        xmin, xmax, ymin, ymax = bbox_for_normalization()
        self.register_buffer("xmin", torch.tensor(xmin, dtype=torch.float32))
        self.register_buffer("xmax", torch.tensor(xmax, dtype=torch.float32))
        self.register_buffer("ymin", torch.tensor(ymin, dtype=torch.float32))
        self.register_buffer("ymax", torch.tensor(ymax, dtype=torch.float32))

        # Random Fourier feature projection (Tancik et al. 2020). Frozen,
        # not learned: keeps the teaching story of "raise the input frequency
        # before the MLP so it can represent sharp features".
        if fourier_features:
            generator = torch.Generator().manual_seed(int(fourier_seed))
            b = torch.randn(2, fourier_num_features, generator=generator) * float(fourier_sigma)
            self.register_buffer("fourier_B", b)
            d_in = 2 * fourier_num_features  # [sin, cos] of the projection
        else:
            self.register_buffer("fourier_B", torch.zeros(2, 1))
            d_in = 2

        layers: list[nn.Module] = []
        for _ in range(n_hidden_layers):
            layers.extend([nn.Linear(d_in, hidden_dim), nn.Tanh()])
            d_in = hidden_dim
        layers.append(nn.Linear(d_in, 2))
        self.net = nn.Sequential(*layers)

        self._init_weights()

    def _init_weights(self) -> None:
        for m in self.modules():
            if isinstance(m, nn.Linear):
                nn.init.xavier_normal_(m.weight)
                if m.bias is not None:
                    nn.init.zeros_(m.bias)

    def _normalized_coords(self, x: torch.Tensor, y: torch.Tensor) -> torch.Tensor:
        if not self.normalize_inputs:
            return torch.cat([x, y], dim=-1)
        span_x = self.xmax - self.xmin + 1e-12
        span_y = self.ymax - self.ymin + 1e-12
        xn = 2.0 * (x - self.xmin) / span_x - 1.0
        yn = 2.0 * (y - self.ymin) / span_y - 1.0
        return torch.cat([xn, yn], dim=-1)

    def _encode(self, coords: torch.Tensor) -> torch.Tensor:
        """Apply random Fourier feature encoding when enabled."""
        if not self.fourier_features:
            return coords
        # coords: (N, 2); fourier_B: (2, M); proj: (N, M).
        proj = 2.0 * torch.pi * (coords @ self.fourier_B)
        return torch.cat([torch.sin(proj), torch.cos(proj)], dim=-1)

    def forward(self, x: torch.Tensor, y: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor]:
        coords = self._normalized_coords(x, y)
        inp = self._encode(coords)
        out = self.net(inp)
        return out[:, 0:1], out[:, 1:2]


@torch.no_grad()
def count_parameters(model: nn.Module) -> int:
    return sum(p.numel() for p in model.parameters() if p.requires_grad)


def von_mises_field(
    model: PINN,
    x: torch.Tensor,
    y: torch.Tensor,
    mat: MaterialProps | None = None,
) -> torch.Tensor:
    """
    Von Mises stress at collocation points (requires ``x,y`` to require grad).

    Typical usage inside a training step where ``x,y`` are leaf tensors with
    ``requires_grad_(True)``.
    """
    u, v = model(x, y)
    eps_xx, eps_yy, gamma_xy = strains_from_displacement(u, v, x, y)
    sxx, syy, txy = stresses_plane_stress(eps_xx, eps_yy, gamma_xy, mat)
    return von_mises_stress(sxx, syy, txy)


def von_mises_grid(
    model: PINN,
    geometry,
    grid_n: int = 64,
    *,
    mat: MaterialProps | None = None,
    device: torch.device | None = None,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Evaluate Von Mises on a regular grid over the outer square, masked to NaN outside solid.

    Returns ``(X, Y, VM)`` as float32 numpy arrays of shape ``(grid_n, grid_n)`` suitable
    for Plotly contours.
    """
    dev = device or next(model.parameters()).device
    model.eval()
    xs = np.linspace(0.0, 1.0, grid_n, dtype=np.float32)
    ys = np.linspace(0.0, 1.0, grid_n, dtype=np.float32)
    X, Y = np.meshgrid(xs, ys, indexing="xy")
    mask = geometry_mask_np(X, Y, geometry)

    x_flat = torch.tensor(X.reshape(-1, 1), device=dev, requires_grad=True)
    y_flat = torch.tensor(Y.reshape(-1, 1), device=dev, requires_grad=True)

    u, v = model(x_flat, y_flat)
    eps_xx, eps_yy, gamma_xy = strains_from_displacement(u, v, x_flat, y_flat)
    sxx, syy, txy = stresses_plane_stress(eps_xx, eps_yy, gamma_xy, mat)
    vm = von_mises_stress(sxx, syy, txy)
    vm_np = vm.detach().cpu().numpy().reshape(grid_n, grid_n)
    vm_np = np.where(mask, vm_np, np.nan).astype(np.float32)
    return X.astype(np.float32), Y.astype(np.float32), vm_np
