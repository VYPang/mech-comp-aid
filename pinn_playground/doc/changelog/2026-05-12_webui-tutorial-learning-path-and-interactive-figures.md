# Changelog - 2026-05-12

## Summary

This note covers the staged **PINN Playground** changes that build on top of the earlier WebUI refactor and diagnostics foundation.

Unlike the previous 2026-05-12 note, this pass does add a new teaching feature: a dedicated **PINN Tutorial** checkpoint inserted into the learning path before **Preview Collocation Points**. The tutorial is not a static markdown dump. It is implemented as a new WebUI cell with seven interactive figures that bridge the student from familiar numerical-method ideas into machine learning, deep learning, Physics-Informed Neural Networks, and finally PINNs as physics-aware surrogates inside a broader engineering workflow.

The main result is that the frontend now has:

1. a new tutorial checkpoint in the PINN learning path,
2. a dedicated tutorial cell that temporarily replaces the normal three-plot workspace,
3. seven lightweight interactive lesson figures built in plain JavaScript and Canvas,
4. tutorial prose integrated directly into the existing shell rather than linked externally,
5. updated cache-version wiring so the new module graph loads consistently in the browser.

No backend routes or training logic were changed in this pass. This was a frontend teaching-surface integration.

---

## Why This Tutorial Integration Was Needed

After the diagnostics refactor, the WebUI had a cleaner runtime structure, but the student experience still jumped too abruptly from the numerical FEM baseline into PINN controls.

That created a teaching gap.

The current workflow already asks students to:

- trust a numerical reference solution,
- inspect collocation points,
- configure a PINN,
- interpret loss terms,
- understand why teacher guidance helps.

However, the UI did not yet provide a structured bridge from:

- exact parameter solving,
- to noisy curve fitting,
- to general machine-learning ideas,
- to neural networks,
- to PINN-specific losses and failure modes.

That missing bridge matters because the PINN controls make more sense once the student understands that a PINN is still a parameterized function model, just one trained with physics-based objectives rather than only labeled pairs.

The objective of this pass was therefore to insert a real tutorial step into the WebUI flow itself rather than leaving that explanation outside the product.

---

## Core Integration - A New Tutorial Checkpoint In The Learning Path

### What was added

The PINN checkpoint group in:

- `pinn_playground/frontend/progress-state.js`

now begins with a new manual-completion checkpoint:

- `pinn-tutorial`
- title: `PINN Tutorial`
- cell id: `pinnTutorial`

This checkpoint is intentionally placed before:

- `pinn-preview`

so the learning path order is now:

1. PINN Tutorial
2. Preview Collocation Points
3. Train PINN
4. Teacher-Guided PINN

### Why this change matters

This means the tutorial is no longer optional side documentation. It is part of the same checkpoint progression model as the rest of the WebUI.

The tutorial step now functions as a conceptual handoff between:

- the numerical cell, where the student builds trust in FEM as a baseline,
- and the PINN cell, where the student starts working with collocation, physics losses, and training behavior.

---

## New Frontend Surface - Dedicated Tutorial Cell

### What was added

A new frontend module now owns the tutorial experience:

- `pinn_playground/frontend/tutorial-cell.js`

This cell is mounted from:

- `pinn_playground/frontend/shell.js`

using a new cell entry:

- `pinnTutorial: createTutorialCell(...)`

### How the tutorial cell works

When the tutorial checkpoint becomes active, the cell:

- hides the standard left/right/bottom plot workspace,
- replaces the controls area with section-tab navigation,
- inserts a tutorial container into the main workspace column,
- renders each lesson section and mounts its interactive figure,
- updates the active tab while the user scrolls through sections,
- restores the standard plot layout when the user leaves the checkpoint.

This keeps the lesson inside the same application shell rather than spawning a separate page or breaking the checkpoint workflow.

### Why this design was chosen

The goal was not to bolt markdown onto the side of the app. The tutorial needed to feel like a first-class teaching checkpoint that still respects the current shell structure, progress logic, coach panel, and completion model.

That is why the tutorial is implemented as a dedicated cell rather than as a modal, an external page, or a static documentation link.

---

## Tutorial Content - Notes Converted Into Lesson Sections

### What was added

Two new content-side files were introduced:

- `pinn_playground/doc/pinn_tutorial_notes.md`
- `pinn_playground/frontend/lessons/tutorial-content.js`

The markdown note stores the longer teaching draft. The frontend content module then brings that material into the WebUI in a form that the shell can render directly.

### Content approach

The wording in the tutorial sections was lifted near-verbatim from the tutorial note and then adjusted only where the original draft referred to figure placeholders.

Those placeholder references were replaced with real in-UI figures so each section now includes both:

- the conceptual explanation,
- and the matching interactive visual.

### Lesson structure

The tutorial content is organized into seven sections plus a closing summary:

1. computing parameters of a known function,
2. moving from exact solving to noisy curve fitting,
3. machine learning as data-driven parameter search,
4. deep learning as a higher-capacity function model,
5. PINNs as neural networks trained with physics losses,
6. common PINN failure modes and mitigation ideas,
7. PINNs as surrogates inside larger engineering workflows.

This ordering mirrors the intended teaching progression rather than dropping the student directly into PINN-specific vocabulary.

---

## Interactive Figures - Seven Small, Purpose-Built Teaching Tools

### Shared figure infrastructure

A new shared module now supports the interactive figures:

- `pinn_playground/frontend/lessons/figure-base.js`

This file provides the common infrastructure needed across the lesson figures, including:

- HiDPI Canvas setup,
- math-domain to pixel-domain mapping,
- requestAnimationFrame-based redraw scheduling,
- unified pointer drag handling,
- light axis/grid rendering,
- a small 3x3 linear solver,
- small polynomial fitting helpers,
- deterministic random sampling helpers,
- shared figure-shell layout construction.

### Architectural choice

The figures were implemented in plain JavaScript with the Canvas API, using a shared pattern where:

- figure state lives in plain objects,
- input handlers update state,
- rendering is redrawn from state,
- redraws are coalesced to one per animation frame.

This keeps the lesson code aligned with the current frontend stack. No new dependency or build-system layer was introduced.

### The seven figures

The following new modules were added under:

- `pinn_playground/frontend/lessons/figures/`

#### 1. Exact quadratic recovery

- `figure-1-quadratic-fit.js`

Students drag three points, watch the quadratic rebuild, and see the corresponding 3x3 system update in real time.

#### 2. Noisy polynomial fitting

- `figure-2-polynomial-fit.js`

Students fit a polynomial of adjustable degree to noisy samples from a hidden cubic and see underfitting, reasonable fitting, and overfitting behavior.

#### 3. Generalization and test error

- `figure-3-generalization.js`

Students compare train and test behavior, vary model capacity, and query predictions at unseen inputs.

#### 4. MLP forward-pass intuition

- `figure-4-mlp-forward.js`

Students change width, depth, seed, and input value while watching a small neural network propagate activations and report parameter count.

#### 5. PINN loss composition

- `figure-5-pinn-loss.js`

Students see interior, boundary, and teacher points in a 2D domain and adjust the relative importance of PDE, boundary, and data losses.

#### 6. PINN failure modes

- `figure-6-failure-modes.js`

Students toggle normalization, boundary-type assumptions, teacher guidance, and loss weights while comparing a toy predicted field against a reference field.

#### 7. PINN as surrogate inside a design loop

- `figure-7-surrogate-loop.js`

Students compare a fast surrogate response against occasional FEM verification points and see why neural surrogates are useful even when they do not replace FEM outright.

### Why this figure set matters

Together, these figures turn the tutorial into an interactive reasoning path rather than a block of explanation. Each section is tied to one idea, one visual, and one small interaction surface.

That is especially important for the later PINN sections, where abstract concepts such as collocation, loss balancing, indirect boundary supervision, and surrogate trust regions are easier to teach through parameterized visuals than through prose alone.

---

## Shell Reliability Fix - Group Lookup No Longer Assumes Cell Id Equals Group Id

### Problem discovered during integration

Adding a new tutorial checkpoint exposed an assumption inside:

- `pinn_playground/frontend/shell.js`

The shell had been using `checkpoint.cellId` as though it were also the checkpoint-group identifier.

That worked for the existing setup because both earlier cells happened to align with the group names closely enough:

- `numerical`
- `pinn`

The new tutorial cell intentionally uses:

- `pinnTutorial`

which is a cell id, not a learning-path group id.

### Fix applied

The shell now resolves the group by checkpoint membership using a small `findGroupId(checkpointId)` helper.

This updated:

- initial group-collapse selection,
- active-group tracking while navigating checkpoints,
- workspace header group lookup.

### Why this matters

This is more than a cosmetic cleanup. Without the fix, the new tutorial checkpoint would have broken group-collapsing behavior and workspace-header labeling because the shell would be looking up a non-existent group named `pinnTutorial`.

The corrected logic is more structurally sound because it uses the checkpoint-to-group relationship directly rather than depending on a naming coincidence.

---

## Styling And Presentation

### What changed

The tutorial UI introduced a substantial new style block in:

- `pinn_playground/frontend/style.css`

This styling covers:

- section tabs,
- lesson container layout,
- figure shells,
- responsive figure grids,
- sidebars and statistics rows,
- button styling,
- warning and success callouts,
- matrix display layout,
- weighted loss bars,
- lesson-specific typography and spacing.

### Why this matters

Without a dedicated style layer, the tutorial would have looked like a collection of appended controls rather than a coherent teaching surface.

The new CSS gives the tutorial a visual identity that still fits within the existing shell styling while clearly distinguishing lesson content from the standard plotting workspace.

---

## Asset Graph Update - Cache Refresh For Interconnected Modules

The frontend cache version was bumped from:

- `checkpoint-shell-13`

to:

- `checkpoint-shell-14`

across the touched frontend entry points and imports.

This includes:

- `app.js`
- `diagnostics.js`
- `index.html`
- `numerical-cell.js`
- `pinn-cell.js`
- `shell.js`
- all new tutorial-related module imports.

This matters because the tutorial introduced several new ES modules and changed shell wiring. Without a version bump, the browser could mix the previous shell with the new tutorial graph.

---

## Verification

Verified during development:

- the new and modified frontend JavaScript modules passed `node --check`,
- the new tutorial checkpoint is defined before `pinn-preview` in the progress model,
- the shell wiring includes the new tutorial cell and the corrected group lookup logic,
- the lesson figures share one common Canvas utility layer rather than duplicating rendering infrastructure.

Not yet fully verified in this pass:

- a live browser smoke test with the server running and the updated tutorial checkpoint opened interactively.

That means the staged changes are structurally wired and syntax-checked, but the final browser walkthrough still depends on launching the current frontend/backend session and stepping through the new checkpoint in the UI.

---

## Current Status

Working in the staged changes:

- the PINN learning path now contains a dedicated tutorial checkpoint,
- tutorial prose is integrated into the WebUI rather than living only in a draft note,
- seven interactive figures are available as lightweight frontend teaching tools,
- the shell can mount and unmount the tutorial surface cleanly,
- the earlier shell assumption tying cell ids to group ids has been corrected,
- the asset graph has been cache-bumped to keep module loading consistent.

Most important implementation implication:

- **the PINN Playground now teaches the conceptual bridge into PINNs inside the WebUI itself, rather than expecting the student to make that jump from controls alone**.

---

## Next Stage

The next useful step is not to add more static explanation. It is to validate this tutorial inside the running browser and then connect it more tightly to the live PINN workflow.

Recommended next steps:

1. Smoke-test the tutorial checkpoint in the browser, including figure interactions and layout restoration when leaving the cell.
2. Decide whether the learning-path reset behavior should explicitly surface the new tutorial checkpoint for users with older local storage state.
3. Consider whether any tutorial figures should later read live playground parameters rather than staying intentionally self-contained.
4. If mathematical typography becomes important, add a dedicated math-rendering layer rather than relying on plain text and Unicode formatting.