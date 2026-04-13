# Changelog - 2026-04-13

## Summary

Today focused on two major tracks inside `pinn_playground`:

- introducing a staged checkpoint shell for the teaching UI
- building the first usable FEM baseline with `scikit-fem`

The goal was to move the app away from a freeform PINN-only dashboard and toward a guided learning flow where students see the numerical-method baseline first, then continue into the PINN workflow.

## Planning and documentation

- Added a PINN planning note to pause major PINN expansion until a trusted FEM baseline exists.
- Added and refined the FEM planning document around:
  - programmatic mesh generation first
  - bottom-edge support
  - top-edge traction patch
  - no `gmsh` requirement for the first milestone
- Agreed that the user-facing product should use a checkpoint-style learning shell rather than fully separate FEM and PINN pages.

## FEM backend

### New shared FEM problem contract

Added:

- `pinn_playground/backend/problem_definition.py`

This file defines validated FEM configuration models for:

- geometry
- material
- support
- load patch
- mesh resolution

It also generates a stable `case_id` so future FEM and PINN results can be paired later.

### FEM geometry and preview

Added:

- `pinn_playground/backend/fem_geometry.py`

Implemented:

- structured triangular mesh generation using `scikit-fem`
- frame + reinforcement masking for:
  - `base`
  - `diagonal`
  - `x_brace`
- outer-edge tagging
- top-load patch selection
- serialized preview payloads for the frontend

### FEM solve

Added:

- `pinn_playground/backend/fem_solver.py`

Implemented:

- static 2D plane-stress FEM solve
- stiffness assembly
- traction loading on the top-edge patch
- bottom-edge Dirichlet support
- element-wise stress recovery
- von Mises computation
- deformed-mesh payload generation
- scalar solve summary data

### FastAPI routes

Updated:

- `pinn_playground/backend/main.py`

Available FEM routes now:

- `POST /api/fem/preview`
- `POST /api/fem/solve`

Existing PINN routes remain in place:

- `POST /api/preview-points`
- `WS /ws/train`

## Frontend shell refactor

### New learning shell

Reworked:

- `pinn_playground/frontend/index.html`
- `pinn_playground/frontend/style.css`

The app now presents one shell with:

- `Learning Path`
- `Active Workspace`
- `Coach Panel`

The learning path is organized into two cells:

- `Numerical Cell`
- `PINN Cell`

### Frontend modules added

Added:

- `pinn_playground/frontend/api.js`
- `pinn_playground/frontend/progress-state.js`
- `pinn_playground/frontend/checkpoint-rules.js`
- `pinn_playground/frontend/plots.js`
- `pinn_playground/frontend/numerical-cell.js`
- `pinn_playground/frontend/pinn-cell.js`
- `pinn_playground/frontend/shell.js`

Updated:

- `pinn_playground/frontend/app.js`

`app.js` is now only a bootstrap entrypoint. Cell-specific behavior has been moved into dedicated modules.

## Checkpoint system

Implemented a first version of checkpoint progression:

- manual progression for most checkpoints
- completion metadata stored in frontend state
- local persistence with `localStorage`
- support for future completion modes:
  - `manual`
  - `api_success`
  - `rule`

The current learning path includes:

- Numerical: Preview Mesh and Loading
- Numerical: Run FEM Solve
- Numerical: Inspect Numerical Result
- PINN: Preview Collocation Points
- PINN: Train PINN
- PINN: Compare Against FEM

## Numerical Cell behavior

### Live preview

The first numerical checkpoint now supports live FEM preview from the browser:

- geometry changes
- mesh density changes
- frame thickness changes
- brace thickness changes
- top load patch center and width

The preview renders:

- structured FEM mesh
- fixed bottom support
- top-edge load patch
- internal frame / brace boundaries

### FEM solve in the UI

The `Numerical: Run FEM Solve` checkpoint now has a real solve button wired to `POST /api/fem/solve`.

The workspace now renders:

- left plot: deformed mesh
- right plot: von Mises stress heatmap
- bottom plot: FEM solve summary

This checkpoint now uses `api_success` completion, so students cannot complete it until the FEM solve succeeds.

## PINN Cell behavior

The existing PINN dashboard behavior was preserved inside the new shell:

- collocation preview
- WebSocket training
- stress heatmap
- loss curves
- guide text

This means the checkpoint shell wraps the existing PINN experience without removing the live training workflow.

## Caching and UI fixes

- Added cache-busting query parameters for frontend assets so browser-cached JS/CSS would not leave the shell stuck on placeholder text.
- Added shell refresh hooks so checkpoint completion state updates immediately after runtime events like FEM solve success.

## Verification

Verified during development:

- frontend module syntax checks passed
- backend route imports passed
- no linter errors were reported on edited files
- FEM solve smoke tests succeeded for:
  - `base`
  - `diagonal`
  - `x_brace`

## Current status at end of day

Working:

- checkpoint shell
- Numerical Cell live preview
- Numerical Cell FEM solve
- PINN Cell preview and training inside the shell

Not implemented yet:

- FEM convergence study
- FEM-vs-PINN comparison checkpoint
- automatic rule-based checkpoint requirements beyond `api_success`
- higher-fidelity FEM geometry workflow with `gmsh`

## Recommended next steps

1. Add a convergence-study endpoint and chart for the numerical cell.
2. Add a result-quality summary to help students interpret mesh sensitivity.
3. Start sharing a stricter common problem definition between FEM and PINN so later comparison is truly apples-to-apples.
4. Add the FEM-vs-PINN comparison checkpoint once both sides can produce stable comparable outputs.
