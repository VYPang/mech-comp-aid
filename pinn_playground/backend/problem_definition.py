"""Shared FEM/PINN problem definitions for structural examples."""

from __future__ import annotations

import hashlib
import json
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

GeometryLiteral = Literal["base", "diagonal", "x_brace"]
LoadEdgeLiteral = Literal["top"]
SupportEdgeLiteral = Literal["bottom"]


class StructuralGeometryConfig(BaseModel):
    """Geometry parameters for the square frame and optional reinforcements."""

    model_config = ConfigDict(extra="ignore")

    geometry: GeometryLiteral = "base"
    frame_thickness: float = Field(default=0.18, gt=0.05, lt=0.45)
    brace_half_width: float = Field(default=0.018, gt=0.0, lt=0.1)

    @property
    def inner_lo(self) -> float:
        return self.frame_thickness

    @property
    def inner_hi(self) -> float:
        return 1.0 - self.frame_thickness

    @property
    def opening_width(self) -> float:
        return self.inner_hi - self.inner_lo

    @model_validator(mode="after")
    def validate_geometry(self) -> "StructuralGeometryConfig":
        if self.opening_width <= 0.0:
            raise ValueError("frame_thickness leaves no opening inside the frame.")
        if self.brace_half_width >= 0.5 * self.opening_width:
            raise ValueError("brace_half_width is too large for the selected opening.")
        return self


class StructuralMaterialConfig(BaseModel):
    """Plane-stress isotropic material parameters."""

    model_config = ConfigDict(extra="ignore")

    young: float = Field(default=210e9, gt=0.0)
    poisson: float = Field(default=0.3, gt=0.0, lt=0.5)


class StructuralSupportConfig(BaseModel):
    """Support definition for the shared teaching problem."""

    model_config = ConfigDict(extra="ignore")

    fixed_edge: SupportEdgeLiteral = "bottom"


class StructuralLoadConfig(BaseModel):
    """Top-edge traction patch used by both FEM and PINN teaching cases."""

    model_config = ConfigDict(extra="ignore")

    edge: LoadEdgeLiteral = "top"
    patch_center: float = Field(default=0.5, ge=0.0, le=1.0)
    patch_width: float = Field(default=0.2, gt=0.02, le=1.0)
    traction_x: float = 0.0
    traction_y: float = Field(default=-1.0)

    @property
    def x_min(self) -> float:
        return self.patch_center - 0.5 * self.patch_width

    @property
    def x_max(self) -> float:
        return self.patch_center + 0.5 * self.patch_width

    @model_validator(mode="after")
    def validate_load_patch(self) -> "StructuralLoadConfig":
        if self.x_min < 0.0 or self.x_max > 1.0:
            raise ValueError("Top-edge load patch must stay inside the unit-square boundary.")
        return self


class StructuralProblemConfig(BaseModel):
    """Validated structural case shared across FEM and PINN."""

    model_config = ConfigDict(extra="ignore")

    geometry: StructuralGeometryConfig = Field(default_factory=StructuralGeometryConfig)
    material: StructuralMaterialConfig = Field(default_factory=StructuralMaterialConfig)
    support: StructuralSupportConfig = Field(default_factory=StructuralSupportConfig)
    load: StructuralLoadConfig = Field(default_factory=StructuralLoadConfig)

    @model_validator(mode="after")
    def validate_problem(self) -> "StructuralProblemConfig":
        if self.support.fixed_edge != "bottom":
            raise ValueError("The shared teaching problem supports only a fixed bottom edge.")
        if self.load.edge != "top":
            raise ValueError("The shared teaching problem supports only top-edge loading.")
        return self

    def case_id(self) -> str:
        """Stable identifier for the shared physical problem definition."""
        payload = json.dumps(self.model_dump(mode="json"), sort_keys=True)
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:12]


class FEMGeometryConfig(StructuralGeometryConfig):
    """Backward-compatible FEM geometry schema."""


class FEMMaterialConfig(StructuralMaterialConfig):
    """Backward-compatible FEM material schema."""


class FEMSupportConfig(StructuralSupportConfig):
    """Backward-compatible FEM support schema."""


class FEMLoadConfig(StructuralLoadConfig):
    """Backward-compatible FEM load schema."""


class FEMMeshConfig(BaseModel):
    """Mesh settings for a lightweight structured-triangle baseline."""

    model_config = ConfigDict(extra="ignore")

    n_cells: int = Field(default=40, ge=8, le=180)


class FEMProblemConfig(StructuralProblemConfig):
    """Validated FEM case definition shared across preview, solve, and comparison."""

    model_config = ConfigDict(extra="ignore")

    geometry: FEMGeometryConfig = Field(default_factory=FEMGeometryConfig)
    material: FEMMaterialConfig = Field(default_factory=FEMMaterialConfig)
    support: FEMSupportConfig = Field(default_factory=FEMSupportConfig)
    load: FEMLoadConfig = Field(default_factory=FEMLoadConfig)
    mesh: FEMMeshConfig = Field(default_factory=FEMMeshConfig)
