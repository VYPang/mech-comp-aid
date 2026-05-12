# Changelog - 2026-05-12

## Summary

This note covers the **PINN Playground** refactor performed after the teacher-guided PINN milestone. The goal of this pass was **not** to add the new tutorial or AI tutor features yet. The goal was to clean the current codebase so those features can be added on top of a more structured implementation.

The main result is that the project now has a clearer separation between:

1. shared control-to-config translation,
2. guide-content heuristics,
3. backend diagnostics and lightweight computation checks,
4. browser-side runtime inspection.

The most important new capability is a **diagnostics foundation** that can inspect the current WebUI-like state, run selected backend computations, and return structured findings plus recommended parameter updates. That is not yet the full tutor, but it is deliberately shaped like the future tutor interaction contract.

Unrelated edits outside `pinn_playground/` are intentionally omitted from this note.

---

## Why This Refactor Was Needed

The current checkpoint-based UI was already functional, but several structural issues would have made the next teaching-tool phase harder to implement correctly.

### What the codebase was doing poorly

Before this pass:

- `numerical-cell.js` and `pinn-cell.js` were doing too many jobs at once,
- control defaults, control reading, and backend config construction were duplicated,
- guide text was embedded directly inside the cells,
- the app had no single structured snapshot of the current browser state,
- there was no first-class backend mechanism to evaluate a WebUI configuration outside the main interactive flow.

That meant the future tutorial and tutor work would likely have turned into one more layer of coupling rather than a clean extension.

### Refactor objective

The objective was therefore to create a code path where:

- the browser can describe its state as structured config,
- the backend can evaluate that state deterministically,
- the result can include both explanations and suggested updates,
- the same flow can later be reused by an interactive tutoring agent.

---

## Core Refactor - Shared Control And Guide Infrastructure

### Frontend control/config extraction

The largest structural change was to move shared parameter translation into a dedicated module:

- `pinn_playground/frontend/control-config.js`

This file now owns:

- default FEM controls,
- default PINN controls,
- shared structural-problem construction,
- FEM config construction,
- PINN config construction,
- diagnostics request construction from the current runtime state.

This matters because the browser now has one place that defines how UI controls become backend payloads.

That reduces drift between:

- the numerical cell,
- the PINN cell,
- diagnostics,
- future tutoring or lesson code that needs to inspect or modify parameters.

### Guide-content extraction

The current rule-based coaching text was also pulled into a dedicated module:

- `pinn_playground/frontend/guide-content.js`

This keeps the existing coach behavior, but the cell files no longer need to embed all guide heuristics inline.

That is useful for the next phase because the current rule-based guidance can now be replaced more cleanly by:

- lesson-aware prompts,
- tutor-generated messages,
- checkpoint-specific teaching logic.

### Immediate impact on the cell files

The two large cell files were reduced by moving common logic out of them:

- `pinn_playground/frontend/numerical-cell.js`
- `pinn_playground/frontend/pinn-cell.js`

They still manage rendering and interactive behavior, but they now depend on shared helper modules for:

- reading control values,
- building backend config,
- generating guide sections.

This is a structural cleanup rather than a behavior rewrite.

---

## Diagnostics Foundation - New Structured State Evaluation

## What was added

A new backend module now provides deterministic diagnostics for the current WebUI-like state:

- `pinn_playground/backend/diagnostics.py`

This file introduces three main models:

```python
class DiagnosticRunOptions(BaseModel):
    fem_preview: bool = True
    fem_solve: bool = False
    pinn_preview: bool = True
    teacher_preview: bool = True
    stress_grid_n: int = Field(default=40, ge=16, le=120)


class WebUIDiagnosticsRequest(BaseModel):
    fem: FEMProblemConfig = Field(default_factory=FEMProblemConfig)
    pinn: TrainingConfig = Field(default_factory=TrainingConfig)
    run: DiagnosticRunOptions = Field(default_factory=DiagnosticRunOptions)
    student_question: str | None = None


class DiagnosticFinding(BaseModel):
    severity: FindingSeverity
    code: str
    message: str
    target: str | None = None
    suggested_updates: dict[str, Any] = Field(default_factory=dict)
    highlight_keys: list[str] = Field(default_factory=list)
```

The main entry point is:

```python
evaluate_webui_state(request: WebUIDiagnosticsRequest) -> dict[str, Any]
```

## How diagnostics.py works

The diagnostics flow has four stages.

### 1. Normalize the FEM and PINN inputs into comparable state

The request accepts:

- one FEM config,
- one PINN config,
- a set of run options.

The backend converts the FEM configuration into a shared structural problem so FEM and PINN can be compared on their **physics definition** rather than on mesh-specific metadata.

This is important because the FEM case ID includes the mesh, while the PINN case ID reflects only the shared structural problem.

That comparison bug was explicitly fixed during this pass.

### 2. Generate structured findings

The diagnostics module then produces findings such as:

- FEM/PINN shared-problem mismatch,
- low PINN domain density,
- low PINN boundary density,
- disabled input normalization,
- residual resampling configured but inactive under uniform sampling,
- teacher-guided mode enabled without teacher points,
- no load-patch teacher points,
- weak teacher loss weight.

Each finding may include:

- a severity,
- a machine-readable code,
- a human-readable explanation,
- a target path,
- recommended updates,
- highlight keys.

### 3. Optionally run lightweight computations

Depending on `run`, diagnostics can call existing backend routes internally to verify that the selected state still computes correctly:

- FEM preview,
- FEM solve,
- PINN collocation preview,
- teacher-point preview.

Each output is recorded under `outputs` with:

- success/error status,
- compact summaries,
- error messages when a step fails.

### 4. Merge suggested updates into one tutor-shaped result

If multiple findings suggest related changes, the backend merges them into:

- `recommended_updates`
- `highlight_keys`

This makes the result look much closer to the future tutoring contract, where a model explains the current issue and proposes small parameter updates.

---

## Agent Interaction - Backend, CLI, And Browser Paths

## Backend API path

Diagnostics is now exposed through FastAPI in:

- `pinn_playground/backend/main.py`

New route:

```text
POST /api/diagnostics
```

This means an external agent, script, or test can send a structured WebUI-like request directly to the backend without clicking through the interface.

That is the most important foundation for future tutoring because an agent no longer needs to scrape raw DOM state or reconstruct backend payloads by guesswork.

### Example API request shape

```json
{
  "fem": {
    "geometry": {
      "geometry": "base",
      "frame_thickness": 0.18,
      "brace_half_width": 0.018
    },
    "load": {
      "patch_center": 0.5,
      "patch_width": 0.2,
      "traction_x": 0.0,
      "traction_y": -1.0,
      "edge": "top"
    },
    "mesh": {
      "n_cells": 40
    }
  },
  "pinn": {
    "sampling_strategy": "uniform",
    "n_domain": 200,
    "n_boundary": 32,
    "normalize_inputs": false,
    "teacher": {
      "enabled": true,
      "n_interior": 40,
      "n_boundary": 10,
      "n_load_patch": 0,
      "weight": 0.5
    }
  },
  "run": {
    "fem_preview": true,
    "fem_solve": false,
    "pinn_preview": true,
    "teacher_preview": true,
    "stress_grid_n": 40
  }
}
```

### Example API result shape

```json
{
  "type": "webui_diagnostics",
  "findings": [
    {
      "severity": "warning",
      "code": "pinn_inputs_not_normalized",
      "target": "pinn.normalize_inputs",
      "message": "Input normalization is off; this usually makes PINN optimization less stable.",
      "suggested_updates": {
        "pinn": {
          "normalize_inputs": true
        }
      },
      "highlight_keys": ["pinn.normalize_inputs"]
    }
  ],
  "recommended_updates": {
    "pinn": {
      "normalize_inputs": true,
      "n_domain": 600,
      "n_boundary": 120,
      "teacher": {
        "n_load_patch": 12,
        "weight": 5.0
      }
    }
  },
  "highlight_keys": [
    "pinn.normalize_inputs",
    "pinn.n_domain",
    "pinn.n_boundary",
    "pinn.teacher.n_load_patch",
    "pinn.teacher.weight"
  ]
}
```

That structure is already close to what the future tutor will need.

## CLI path

The backend CLI now exposes a first-class diagnostics command in:

- `pinn_playground/backend/cli.py`

Examples:

```bash
uv run python -m pinn_playground.backend.cli diagnose
```

```bash
uv run python -m pinn_playground.backend.cli diagnose --fem-solve --stress-grid-n 24
```

```bash
uv run python -m pinn_playground.backend.cli diagnose --input path/to/request.json --json
```

This path is useful for:

- fast backend smoke checks,
- regression testing after refactors,
- scripted agent workflows that do not need the browser open.

## Browser path

The browser shell now installs a small debug surface in:

- `pinn_playground/frontend/diagnostics.js`
- wired from `pinn_playground/frontend/shell.js`

The browser exposes:

```js
window.pinnPlaygroundDebug
```

with three main helpers:

```js
window.pinnPlaygroundDebug.getSnapshot()
window.pinnPlaygroundDebug.buildRequest(options)
await window.pinnPlaygroundDebug.runDiagnostics(options)
```

### What these helpers do

`getSnapshot()` returns a structured browser-side state bundle including:

- the active checkpoint,
- progress state,
- checkpoint events,
- the diagnostics request that would currently be sent.

`buildRequest(options)` builds a backend diagnostics request from the current runtime state.

`runDiagnostics(options)` sends that request to `POST /api/diagnostics` and returns the structured result.

That means an agent operating in the browser can inspect the current WebUI state directly rather than rebuilding it manually.

---

## Why This Matters For Future Tutoring

The current diagnostics system does **not** yet modify the WebUI controls automatically, and it does **not** yet produce natural-language tutoring through an LLM.

However, it already establishes the essential tutoring loop:

1. read the current structured state,
2. evaluate the state against physics- and teaching-aware rules,
3. run lightweight computations if needed,
4. return explanations plus structured suggestions.

That means a future tutoring agent can be built on top of the same interface:

- the browser can provide the current FEM and PINN state,
- the agent can inspect `findings`, `recommended_updates`, and `highlight_keys`,
- the same response shape can later be extended with LLM-generated explanatory text,
- the frontend can eventually apply accepted changes back into the controls and highlight them.

In other words, diagnostics is already the first practical prototype of the tutor-control contract.

## Important current limitation

The current flow stops at **recommendation**.

It does not yet:

- write changes back into live controls,
- persist accepted tutor suggestions,
- add conversational memory,
- connect to an LLM provider.

That is by design for this refactor phase.

---

## Additional Backend And UI Reliability Fixes

### FEM preview boundary summaries

The FEM geometry helpers now include boundary counts in the serialized preview payload.

That matters because diagnostics needs compact summaries of boundary structure rather than full raw segment arrays.

### Shared-problem comparison fix

During verification, diagnostics initially reported a false FEM/PINN mismatch even when the physics case was actually aligned.

The reason was that:

- FEM case IDs include mesh information,
- PINN case IDs only describe the shared structural problem.

This pass corrected the comparison so diagnostics now checks FEM/PINN alignment using the shared structural problem only.

### Cache version refresh

The frontend asset graph was bumped to:

- `checkpoint-shell-13`

because the refactor touched several interconnected ES modules:

- shell wiring,
- API helpers,
- extracted control/config helpers,
- extracted guide-content helpers,
- diagnostics browser hook.

Without a cache bump, old and new modules could have mixed in the browser.

---

## Verification

Verified during development:

- backend compilation succeeded with `uv run python -m compileall pinn_playground/backend`,
- touched frontend modules passed `node --check`,
- `POST /api/diagnostics` returned `200` through FastAPI `TestClient`,
- CLI diagnostics ran successfully on the default case,
- CLI diagnostics also ran with `--fem-solve`, confirming that the optional computation path works,
- a deliberately weak PINN configuration produced structured warnings, merged `recommended_updates`, and ordered `highlight_keys`,
- the corrected diagnostics flow now reports `shared_problem_match` when FEM and PINN are aligned on the same structural problem.

---

## Current Status

Working:

- the WebUI still behaves as the same checkpoint-based learning shell,
- FEM and PINN control translation is now centralized,
- rule-based guide content is now centralized,
- the backend can inspect a WebUI-like state outside the main training loop,
- the browser can expose its current state to a debug or agent layer,
- the diagnostics response already supports structured suggested updates.

Most important implementation implication:

- **the codebase now has a tutor-shaped diagnostics path even before the LLM tutor is implemented**.

That lowers the risk of the next phase because future tutorial and tutor work can build on a cleaner control-state boundary.

---

## Next Stage

The next useful step is not to expand the current rule-based coach further. It is to use this new structured boundary to connect lesson content and tutoring behavior.

Recommended next steps:

1. Decide how tutor recommendations should be applied back into the live controls after user approval.
2. Add a frontend layer that can consume `recommended_updates` and visually highlight changed controls.
3. Extend diagnostics output with lesson/checkpoint context so future tutor responses can align to the active teaching objective.
4. Add a provider-backed tutor service that uses the same request shape as diagnostics but returns richer explanatory text.
5. Keep the diagnostics route as the deterministic fallback and regression-check mechanism even after the LLM tutor exists.