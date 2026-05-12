"""Structured diagnostics for WebUI state and lightweight backend verification."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from pinn_playground.backend.fem_geometry import build_fem_preview_payload
from pinn_playground.backend.fem_solver import solve_fem_problem
from pinn_playground.backend.problem_definition import FEMProblemConfig, StructuralProblemConfig
from pinn_playground.backend.training import (
    TrainingConfig,
    build_preview_payload,
    build_teacher_preview_payload,
)

FindingSeverity = Literal["success", "info", "warning", "error"]


class DiagnosticRunOptions(BaseModel):
    """Select which backend computations should run during diagnostics."""

    model_config = ConfigDict(extra="ignore")

    fem_preview: bool = True
    fem_solve: bool = False
    pinn_preview: bool = True
    teacher_preview: bool = True
    stress_grid_n: int = Field(default=40, ge=16, le=120)


class WebUIDiagnosticsRequest(BaseModel):
    """
    Browser- or CLI-facing state snapshot for deterministic diagnostics.

    This is intentionally close to the future AI tutor contract: the caller
    sends current controls plus optional student context, and the backend
    returns compact observations and structured recommendations.
    """

    model_config = ConfigDict(extra="ignore")

    fem: FEMProblemConfig = Field(default_factory=FEMProblemConfig)
    pinn: TrainingConfig = Field(default_factory=TrainingConfig)
    run: DiagnosticRunOptions = Field(default_factory=DiagnosticRunOptions)
    student_question: str | None = None


class DiagnosticFinding(BaseModel):
    """One structured issue, observation, or recommendation."""

    severity: FindingSeverity
    code: str
    message: str
    target: str | None = None
    suggested_updates: dict[str, Any] = Field(default_factory=dict)
    highlight_keys: list[str] = Field(default_factory=list)


def evaluate_webui_state(request: WebUIDiagnosticsRequest) -> dict[str, Any]:
    """Evaluate a WebUI state snapshot and optionally run backend computations."""
    fem_config = request.fem
    fem_problem = _structural_problem_from_fem(fem_config)
    pinn_config = request.pinn

    findings: list[DiagnosticFinding] = []
    findings.extend(_compare_problem_configs(fem_problem, pinn_config.problem))
    findings.extend(_problem_findings("fem", fem_problem))
    findings.extend(_problem_findings("pinn", pinn_config.problem))
    findings.extend(_pinn_training_findings(pinn_config))

    outputs: dict[str, Any] = {}
    if request.run.fem_preview:
        outputs["fem_preview"] = _run_step("fem_preview", lambda: _summarize_fem_preview(fem_config))
    if request.run.fem_solve:
        outputs["fem_solve"] = _run_step(
            "fem_solve",
            lambda: _summarize_fem_solve(fem_config, grid_n=request.run.stress_grid_n),
        )
    if request.run.pinn_preview:
        outputs["pinn_preview"] = _run_step("pinn_preview", lambda: _summarize_pinn_preview(pinn_config))
    if request.run.teacher_preview:
        outputs["teacher_preview"] = _run_step(
            "teacher_preview",
            lambda: _summarize_teacher_preview(pinn_config),
        )

    findings.extend(_output_findings(outputs))

    return {
        "type": "webui_diagnostics",
        "case_ids": {
            "fem": fem_config.case_id(),
            "fem_physics": fem_problem.case_id(),
            "pinn": pinn_config.physics_case_id(),
            "pinn_run": pinn_config.run_id(),
        },
        "configs": {
            "fem": fem_config.model_dump(mode="json"),
            "pinn": pinn_config.model_dump(mode="json"),
        },
        "findings": [finding.model_dump(mode="json") for finding in findings],
        "recommended_updates": _merge_recommended_updates(findings),
        "highlight_keys": _merge_highlight_keys(findings),
        "outputs": outputs,
    }


def _compare_problem_configs(
    fem_problem: StructuralProblemConfig,
    pinn_problem: StructuralProblemConfig,
) -> list[DiagnosticFinding]:
    if fem_problem.case_id() == pinn_problem.case_id():
        return [
            DiagnosticFinding(
                severity="success",
                code="shared_problem_match",
                message="FEM and PINN are using the same structural case.",
            )
        ]

    return [
        DiagnosticFinding(
            severity="warning",
            code="shared_problem_mismatch",
            message=(
                "FEM and PINN controls describe different structural cases. "
                "A later comparison may teach the wrong lesson unless they are synchronized."
            ),
            target="pinn.problem",
            suggested_updates={
                "pinn": {
                    "problem": {
                        "geometry": fem_problem.geometry.model_dump(mode="json"),
                        "material": fem_problem.material.model_dump(mode="json"),
                        "support": fem_problem.support.model_dump(mode="json"),
                        "load": fem_problem.load.model_dump(mode="json"),
                    }
                }
            },
            highlight_keys=[
                "pinn.problem.geometry",
                "pinn.problem.material",
                "pinn.problem.load",
            ],
        )
    ]


def _structural_problem_from_fem(config: FEMProblemConfig) -> StructuralProblemConfig:
    return StructuralProblemConfig(
        geometry=config.geometry.model_dump(mode="json"),
        material=config.material.model_dump(mode="json"),
        support=config.support.model_dump(mode="json"),
        load=config.load.model_dump(mode="json"),
    )


def _problem_findings(prefix: str, problem: StructuralProblemConfig) -> list[DiagnosticFinding]:
    findings: list[DiagnosticFinding] = []
    patch_width = float(problem.load.patch_width)
    frame_thickness = float(problem.geometry.frame_thickness)
    brace_half_width = float(problem.geometry.brace_half_width)

    if patch_width < 0.10:
        findings.append(
            DiagnosticFinding(
                severity="info",
                code=f"{prefix}_narrow_load_patch",
                message="The load patch is narrow, so stress localization should be expected near the top edge.",
                target=f"{prefix}.load.patch_width",
            )
        )

    if frame_thickness > 0.26:
        findings.append(
            DiagnosticFinding(
                severity="info",
                code=f"{prefix}_thick_frame",
                message="The frame is thick, which can make brace effects less visually dramatic.",
                target=f"{prefix}.geometry.frame_thickness",
            )
        )

    if problem.geometry.geometry == "base" and brace_half_width > 0.0:
        findings.append(
            DiagnosticFinding(
                severity="info",
                code=f"{prefix}_unused_brace_width",
                message="Brace width is present in the config but does not affect the base-frame geometry.",
                target=f"{prefix}.geometry.brace_half_width",
            )
        )

    return findings


def _pinn_training_findings(config: TrainingConfig) -> list[DiagnosticFinding]:
    findings: list[DiagnosticFinding] = []

    if not config.normalize_inputs:
        findings.append(
            DiagnosticFinding(
                severity="warning",
                code="pinn_inputs_not_normalized",
                message="Input normalization is off; this usually makes PINN optimization less stable.",
                target="pinn.normalize_inputs",
                suggested_updates={"pinn": {"normalize_inputs": True}},
                highlight_keys=["pinn.normalize_inputs"],
            )
        )

    if config.n_domain < 400:
        findings.append(
            DiagnosticFinding(
                severity="warning",
                code="pinn_low_domain_density",
                message="Domain collocation density is low, so the interior equilibrium field may be under-sampled.",
                target="pinn.n_domain",
                suggested_updates={"pinn": {"n_domain": 600}},
                highlight_keys=["pinn.n_domain"],
            )
        )

    if config.n_boundary < 80:
        findings.append(
            DiagnosticFinding(
                severity="warning",
                code="pinn_low_boundary_density",
                message="Boundary sampling is sparse, so support and traction losses may be unreliable.",
                target="pinn.n_boundary",
                suggested_updates={"pinn": {"n_boundary": 120}},
                highlight_keys=["pinn.n_boundary"],
            )
        )

    if config.sampling_strategy == "uniform" and config.residual_resample_every > 0:
        findings.append(
            DiagnosticFinding(
                severity="info",
                code="pinn_rad_inactive_for_uniform_sampling",
                message="Residual resampling is configured but only activates when adaptive sampling is selected.",
                target="pinn.residual_resample_every",
            )
        )

    if config.teacher.enabled:
        total_teacher = config.teacher.n_interior + config.teacher.n_boundary + config.teacher.n_load_patch
        if total_teacher == 0:
            findings.append(
                DiagnosticFinding(
                    severity="warning",
                    code="teacher_enabled_without_points",
                    message="Teacher-guided mode is enabled but no teacher points are requested.",
                    target="pinn.teacher",
                    suggested_updates={"pinn": {"teacher": {"n_load_patch": 12}}},
                    highlight_keys=["pinn.teacher.n_load_patch"],
                )
            )
        elif config.teacher.n_load_patch == 0:
            findings.append(
                DiagnosticFinding(
                    severity="info",
                    code="teacher_no_load_patch_points",
                    message=(
                        "Teacher points are absent from the load patch. For this Neumann-loaded case, "
                        "a few load-patch displacement anchors are often the most instructive intervention."
                    ),
                    target="pinn.teacher.n_load_patch",
                    suggested_updates={"pinn": {"teacher": {"n_load_patch": 12}}},
                    highlight_keys=["pinn.teacher.n_load_patch"],
                )
            )

        if config.teacher.weight < 1.0:
            findings.append(
                DiagnosticFinding(
                    severity="info",
                    code="teacher_weight_weak",
                    message="The teacher loss weight is low, so FEM displacement anchors may have little influence.",
                    target="pinn.teacher.weight",
                    suggested_updates={"pinn": {"teacher": {"weight": 5.0}}},
                    highlight_keys=["pinn.teacher.weight"],
                )
            )

    return findings


def _run_step(name: str, callback) -> dict[str, Any]:
    try:
        return {"status": "success", **callback()}
    except Exception as exc:  # pragma: no cover - exercised through API/CLI smoke checks
        return {"status": "error", "step": name, "message": str(exc)}


def _summarize_fem_preview(config: FEMProblemConfig) -> dict[str, Any]:
    payload = build_fem_preview_payload(config)
    return {
        "case_id": payload["case_id"],
        "mesh_counts": payload["mesh"]["counts"],
        "boundary_counts": payload["boundaries"].get("counts", _boundary_counts(payload["boundaries"])),
    }


def _summarize_fem_solve(config: FEMProblemConfig, *, grid_n: int) -> dict[str, Any]:
    payload = solve_fem_problem(config, grid_n=grid_n)
    return {
        "case_id": payload["case_id"],
        "summary": payload["summary"],
    }


def _summarize_pinn_preview(config: TrainingConfig) -> dict[str, Any]:
    payload = build_preview_payload(config)
    return {
        "case_id": payload["case_id"],
        "sampling_strategy": payload["sampling_strategy"],
        "counts": payload["counts"],
    }


def _summarize_teacher_preview(config: TrainingConfig) -> dict[str, Any]:
    payload = build_teacher_preview_payload(config)
    return {
        "case_id": payload["case_id"],
        "enabled": payload["enabled"],
        "counts": payload["counts"],
    }


def _output_findings(outputs: dict[str, Any]) -> list[DiagnosticFinding]:
    findings: list[DiagnosticFinding] = []
    for step, output in outputs.items():
        if output.get("status") != "error":
            continue
        findings.append(
            DiagnosticFinding(
                severity="error",
                code=f"{step}_failed",
                message=f"Backend diagnostic step '{step}' failed: {output.get('message', 'unknown error')}",
                target=step,
            )
        )
    return findings


def _merge_recommended_updates(findings: list[DiagnosticFinding]) -> dict[str, Any]:
    merged: dict[str, Any] = {}
    for finding in findings:
        if finding.suggested_updates:
            _deep_merge(merged, finding.suggested_updates)
    return merged


def _merge_highlight_keys(findings: list[DiagnosticFinding]) -> list[str]:
    ordered: list[str] = []
    seen: set[str] = set()
    for finding in findings:
        for key in finding.highlight_keys:
            if key in seen:
                continue
            seen.add(key)
            ordered.append(key)
    return ordered


def _deep_merge(target: dict[str, Any], source: dict[str, Any]) -> None:
    for key, value in source.items():
        if isinstance(value, dict) and isinstance(target.get(key), dict):
            _deep_merge(target[key], value)
            continue
        target[key] = value


def _boundary_counts(boundaries: dict[str, Any]) -> dict[str, int]:
    return {
        name: sum(1 for value in group.get("x", []) if value is None)
        for name, group in boundaries.items()
        if isinstance(group, dict) and "x" in group
    }