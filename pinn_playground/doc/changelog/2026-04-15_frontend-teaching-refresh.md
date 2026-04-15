# Changelog - 2026-04-15

## Summary

Today focused on a **frontend teaching refresh** for `pinn_playground/frontend`: clearer hierarchy for students, less wordy copy, stronger run-state feedback, and a fix for the broken Learning Path cell toggles. **No backend contract, API routes, or WebSocket message schema were changed.**

The goal was to make the checkpoint shell read like a lab worksheet (where am I, what do I change, what do the plots mean, what next) rather than a developer console, while keeping Plotly layouts and existing PINN/FEM behavior intact.

## Shell and Learning Path

### Learning Path collapse toggle fix

- **Root cause:** `shell.js` forced `groupCollapsed[activeCellId] = false` on every `refreshChrome()`, so collapsing the active Numerical or PINN group immediately reopened it after any progress or preview update.
- **Fix:** Remove unconditional auto-expand on every refresh. Auto-expand only when the **active cell** changes (checkpoint moves between Numerical and PINN tracks). User toggles now persist across refreshes.
- **Default visibility:** On wide layouts, both cells start expanded so students see both tracks; narrow layout still uses the existing initial collapse heuristic for the inactive cell.

### Clearer progress and hierarchy

- Added a **step line** in the workspace header: global step index and per-cell step (e.g. `Step 2 of 6 · Numerical Cell 2 of 3`).
- Added **per-group completion** chips in the Learning Path (`X/Y complete` per cell).
- **Next-step button:** When a checkpoint requires `api_success` but the solve has not succeeded yet, the primary button label reflects that (`Complete the required run first`) instead of implying manual completion is available.

### Live run state card (header)

- Replaced a single “Status: …” line with a small **status card**: pill (Idle / Previewing / Running / Ready / Stale / Error), short title, and one line of detail.
- Extended the shell helper API: `setStatus(text, { tone, detail, pill })` and `setGuideSections([{ title, items }])` for structured coach content.

**Files touched:** `index.html`, `style.css`, `app.js`, `shell.js`.

## Copy and teaching flow

### Checkpoint and coach copy

- **`progress-state.js`:** Shortened group descriptions, checkpoint subtitles, controls subtitles, and requirement bullets so the left rail and coach area are less dense.
- **`checkpoint-rules.js`:** Shortened `getCompletionMessage` strings so the coach subtitle matches student actions (e.g. “Run the required solve to unlock the next step”) instead of generic “manual progression” boilerplate.

### Coach panel structure

- **Numerical and PINN cells** now drive the guide via **`setGuideSections`** into three buckets where possible: **What to notice**, **What to try**, **Why it matters**, with a small cap on items per section to avoid walls of text.

**Files touched:** `progress-state.js`, `checkpoint-rules.js`, `numerical-cell.js`, `pinn-cell.js`.

## Numerical Cell (FEM) UI

- **Controls:** Wrapped geometry, load patch, and material blocks in **control cards** with short `field-help` lines; aligned range labels and values with shared CSS (`range-row`, `range-value`).
- **Status:** Preview and solve use the new status tones and detail text; stale solve after control changes surfaces **Stale** messaging and copy in plot summaries / notes where relevant.
- **Event wiring:** Range and number inputs use a single `input` handler (selects use `change`) to avoid duplicate preview scheduling from both `input` and `change`.

**Files touched:** `numerical-cell.js`, `style.css`.

## PINN Cell UI

- **Controls:** Same control-card pattern as the numerical cell for consistency.
- **Training vs preview race:** If a debounced preview request finishes **after** training starts, the UI no longer overwrites the header with “preview ready”; preview status updates are skipped while `isTraining`. Starting training clears any pending preview timer.
- **Loss plot:** For the training checkpoint, only **one** bottom plot update runs: either placeholder notes when there are no epochs, or `renderLossPlot` when there is data (avoids double `Plotly.react` on the same div).
- **WebSocket / status:** Session, metrics, complete, error, disconnect, and stop paths set status tones and detail lines appropriate to idle / running / success / warning / error.

**Files touched:** `pinn-cell.js`, `style.css`.

## Styling

- New utility classes for the status card, status pill variants, status summary box on controls, Learning Path progress chip, guide stack sections, and control cards (see `style.css`).
- Narrow breakpoint: status card can span full width without forcing awkward min-width.

## Cache busting

- Incremented frontend asset query string from `checkpoint-shell-4` to **`checkpoint-shell-5`** on `index.html` and on ES module imports in `app.js`, `shell.js`, `numerical-cell.js`, and `pinn-cell.js` so browsers load the full updated module graph after refresh.

## Verification

Verified during development:

- `node --check` on edited JS entrypoints and cells
- IDE/linter diagnostics clean on touched frontend files
- Headless Chrome + DevTools Protocol scripted pass against a running local server, with screenshots written under `pinn_playground/frontend/`:
  - wide: home, Learning Path toggle collapsed, FEM solve complete, PINN training in progress
  - narrow: training checkpoint layout

**Note:** Headless Chrome may show Plotly **WebGL** fallback messages for `scattergl` in automation screenshots; typical desktop Chrome with GPU support does not reflect that limitation.

## Current status at end of day

Working:

- Reliable per-cell Learning Path expand/collapse
- Clearer header status and workspace step context
- Shorter checkpoint copy and structured coach guidance
- Numerical and PINN control layouts aligned with teaching use
- Stale FEM messaging and PINN training/preview state coherence

Not changed (by design):

- Backend endpoints, request/response shapes, and WebSocket payloads

## Recommended next steps

1. Optional: persist Learning Path collapsed state per cell in `localStorage` across sessions.
2. Optional: add a one-line “last error” strip when preview or solve fails, separate from the coach panel.
3. Continue the FEM-vs-PINN comparison checkpoint when both sides expose comparable fields for side-by-side UI.
