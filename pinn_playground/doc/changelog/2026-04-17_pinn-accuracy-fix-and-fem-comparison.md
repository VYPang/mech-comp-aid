# Changelog - 2026-04-17

## Summary

Today focused on two themes: **correcting a critical PINN accuracy bug** that had been producing physically meaningless stress fields, and **adding a live FEM-vs-PINN comparison layer** so the teaching story can move beyond "PINN runs" toward "PINN versus a trusted reference".

A secondary stream of changes cleaned up the FEM cell UI, replacing the text-only solve summary block with an inline table and hiding the bottom plot panel entirely while the numerical cell is active.

---

## Critical Bug Fix — Traction Scaling

### What was wrong

In `pinn_playground/backend/training.py`, the boundary-condition loss normalized the traction residual by dividing by:

```python
traction_scale = max(float(problem.material.young), 1.0)
```

`problem.material.young` is Young's modulus, e.g. `210 × 10⁹` Pa.

Dividing by that value reduced the traction target to a number near floating-point zero before the loss was computed. The network learned the trivial solution `u = v ≈ 0` everywhere, because that trivially minimized a near-zero traction residual. The displayed stress was then noise amplified back through the physical stiffness, producing corner spikes of roughly 400 MPa that had nothing to do with the load patch.

### Fix applied

Changed to:

```python
traction_scale = max(abs(traction_x), abs(traction_y), 1e-12)
```

The scale is now the magnitude of the configured traction vector. The loss residual is $O(1)$ by construction, and the PINN is forced to produce a non-trivial displacement field.

The `physical_material` used for post-processing stress display was also corrected. It previously read back `config.problem.material.young` (the true physical modulus), which would have over-scaled the stress output. It now uses `traction_scale` so that displayed stresses are in the same units as the configured load.

Files changed:

- `pinn_playground/backend/training.py`

---

## Training Improvements

### Cosine annealing LR scheduler

Added `CosineAnnealingLR` to the Adam optimizer:

```python
scheduler = CosineAnnealingLR(optimizer, T_max=config.epochs, eta_min=max(lr * 0.01, 1e-6))
scheduler.step()  # called at end of each epoch
```

This gradually reduces the learning rate from the initial value down to 1 % of it over the full training run. The effect is that later epochs refine rather than disturb what earlier epochs established, which is particularly important for capturing the stress concentration near the load patch where early over-shooting was common.

### Epoch cap raised from 4 000 to 5 000

The upper limit on the epoch slider was raised from 4 000 to 5 000:

- **Backend**: `epochs: int` field max raised to `le=5000` in the Pydantic config
- **Frontend**: epoch slider `max` attribute raised to `5000` in `pinn-cell.js`

Files changed:

- `pinn_playground/backend/training.py`
- `pinn_playground/frontend/pinn-cell.js`

---

## FEM-vs-PINN Live Comparison

### Motivation

With the traction scaling bug fixed, PINN output is now physically grounded. The next teaching objective is to let students see, epoch by epoch, how close the current PINN field is to the FEM reference — not just at the end of training, but as training progresses.

### Backend — FEM baseline on each run

Added `_build_fem_baseline(config, grid_n)` in `training.py`.

Before the training loop starts, the backend:

1. Converts the `PINNTrainingConfig` into a `FEMProblemConfig` using the same shared structural problem.
2. Runs `solve_fem_problem` at `n_cells=180` on a background thread (`asyncio.to_thread`) to avoid blocking the event loop.
3. Rescales the FEM von Mises field from Pa units into the same traction units used by the PINN display layer (`z_np *= traction_scale / young_physical`).
4. Sends a `{"type": "fem_baseline", "stress_grid": {...}}` WebSocket message to the client before epoch 1.

During training, each metrics message now includes:

```json
"error_grid": { "x": [...], "y": [...], "z": [...] }
```

where `z` is the per-cell absolute difference between the current PINN von Mises field and the FEM baseline, expressed in traction units.

Files changed:

- `pinn_playground/backend/training.py`

### Frontend — comparison tab in the PINN training cell

Added a **tabbed bottom panel** to the PINN training cell in `pinn-cell.js`.

The bottom area now shows three tabs during training:

| Tab | Content |
|---|---|
| Training Curve | Loss vs epoch (unchanged) |
| Compare with Numerical | FEM baseline heatmap (left) + PINN current field (right) |
| Error Heatmap | Absolute difference field, updated every ~50 epochs |

Implementation details:

- `_ensureBottomTabs()` lazily injects the tab bar and sub-containers into `ui.bottomPlot` on first render. Subsequent calls are no-ops.
- `_updateTabButtons()` sets active / idle styling on the tab bar buttons.
- `_renderBottomTabs()` routes the current `activeBottomTab` state to the correct renderer.
- `state.femBaseline` stores the received baseline grid; `state.activeBottomTab` tracks the currently visible tab.

Added `renderErrorHeatmap(containerId, grid)` to `plots.js` — identical API to `renderStressHeatmap` but uses the `"Reds"` colorscale with an "Abs. Error" colorbar title.

Files changed:

- `pinn_playground/frontend/pinn-cell.js`
- `pinn_playground/frontend/plots.js`

---

## DOM Cleanup When Switching Cells

### Problem

When a student switched from the PINN cell to the numerical cell, the tab bar HTML injected by `_ensureBottomTabs()` persisted inside `ui.bottomPlot`. The numerical cell's `enter()` then tried to render FEM plots into a container that was already populated with PINN-specific sub-divs, producing overlapping content.

### Fix

Added `_destroyBottomTabs()` to `pinn-cell.js`. This is called from `leave()` and:

1. Calls `Plotly.purge` on each known sub-container (`#pinn-tab-loss-plot`, `#pinn-baseline-plot`, `#pinn-error-plot`, and the PINN stress container).
2. Sets `ui.bottomPlot.innerHTML = ""` to reset the injection anchor for the next mount.

`state.femBaseline` is also cleared in `startTraining()` so that stopping and restarting training always fetches a fresh FEM baseline rather than re-displaying a stale one.

Files changed:

- `pinn_playground/frontend/pinn-cell.js`

---

## FEM Cell UI — Inline Summary Table

### Problem

The numerical cell was using the shared bottom plot panel (rendered via `renderNotePlot`) to display solve summaries from inside the FEM cell. That panel is structurally intended as a persistent global area, and re-using it for transient per-solve text caused two problems:

1. The bottom panel content was left in a FEM-specific text state when switching to the PINN cell.
2. For FEM work, the summary was physically far from the controls that triggered the solve.

### Changes

**`index.html`**: added `id="bottom-panel"` to the wrapping `<section>` element around the bottom plot area.

**`shell.js`**: added `setBottomPanelVisible(visible)` which toggles `display` on `#bottom-panel`. Made `bottomTitle` and `bottomSummary` optional in `setPlotMeta` so FEM callers can omit them without overwriting whatever the PINN cell last wrote.

**`numerical-cell.js`**:

- `enter()` calls `shell.setBottomPanelVisible(false)` — the bottom panel is hidden entirely while the FEM cell is active.
- `leave()` calls `shell.setBottomPanelVisible(true)` — the panel is restored when switching away.
- A `<div id="fem-summary-table">` was injected inside the "Run FEM Solve" `<details>` block in `renderControls()`, placing the summary physically adjacent to the solve button.
- All seven `renderNotePlot(ui.bottomPlot, ...)` calls were removed and replaced with `_renderSummaryTable(rows)`.
- All `setPlotMeta` calls had `bottomTitle` and `bottomSummary` removed.

**New `_renderSummaryTable(rows)` helper**: renders a two-column `<table>` (label | monospace value) into `#fem-summary-table`.

After a full solve, 8 rows are shown:

| Row | Value |
|---|---|
| Solve time | seconds |
| Max displacement | mm |
| Max von Mises | MPa |
| Deformation scale | multiplier |
| Load facets found | count |
| Max σxx | MPa |
| Max σyy | MPa |
| Max τxy | MPa |

After inspecting a checkpoint, 6 rows are shown (excluding load facets and τxy). Passing an empty array clears the table.

Files changed:

- `pinn_playground/frontend/index.html`
- `pinn_playground/frontend/shell.js`
- `pinn_playground/frontend/numerical-cell.js`

---

## Cache Version

Frontend cache string bumped from `checkpoint-shell-7` to `checkpoint-shell-8` across all five frontend files:

- `index.html`
- `app.js`
- `shell.js`
- `pinn-cell.js`
- `numerical-cell.js`

---

## Verification

- All edited backend and frontend files returned no diagnostics.
- `traction_scale` path smoke-tested: with `traction_y = -1000`, scale is `1000.0`; traction residual is $O(1)$.
- FEM baseline WS message format validated against `renderStressHeatmap` input contract.
- `_destroyBottomTabs()` confirmed to reset `innerHTML` before numerical cell mounts.
- Summary table renders inside the "Run FEM Solve" `<details>` block; bottom panel hidden while FEM cell is active.

---

## Current Status

Working:

- PINN traction-scale bug fixed; network produces physically grounded displacement and stress fields
- Cosine annealing LR decay active during training
- Epoch cap raised to 5 000
- FEM baseline computed before epoch 1 and displayed in the "Compare with Numerical" tab
- Live error heatmap updated alongside training
- DOM cleaned up on PINN cell leave; no bleed-through to numerical cell
- FEM solve summary rendered as inline table; bottom panel hidden for FEM cell

Expected and acceptable at this stage:

- PINN result is still not as faithful as FEM, particularly near corners and the traction patch edge
- Comparison tab provides a qualitative reference; quantitative convergence is not guaranteed

Not implemented yet:

- Automatic sync of physics settings from numerical cell to PINN cell when starting a comparison run
- Dedicated "comparison checkpoint" in the shell for structured side-by-side inspection
- L-BFGS second-order phase after Adam phase
- Per-point adaptive loss weighting based on the error heatmap

## Recommended Next Steps

1. Add a one-click "copy physics from numerical cell" button in the PINN cell controls so comparison runs start from identical problem definitions without manual re-entry.
2. Add scalar summary metrics to the comparison tab: peak error, mean relative error, location of worst disagreement.
3. Evaluate whether a short L-BFGS phase at the end of training would reduce the peak stress error near the load patch.
4. Consider adding a dedicated shell checkpoint for structured comparison that freezes both a finished PINN run and its FEM baseline side by side.
