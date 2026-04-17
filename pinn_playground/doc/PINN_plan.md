# PINN Plan

## Purpose

This document records the current PINN discussion and the recommended future direction so development can pause safely while the numerical-method baseline is built first.

The short conclusion is:

- the current PyTorch PINN prototype is useful as a live demo
- it is **not yet a trustworthy reference solver**
- the project should build the FEM baseline first, then return to PINN with clear ground truth and comparison metrics

Note as of 2026-04-16:

- the PINN control surface and backend problem definition now align with the FEM baseline for geometry, material, bottom support, and top-edge traction patch
- the remaining work is about trust, comparison, and robustness rather than basic parameter mismatch

## Current Status

The repo already contains a working PINN web app under `pinn_playground/`:

- FastAPI backend
- WebSocket training
- geometry preview
- live loss curves
- live von Mises heatmap
- three geometries: `base`, `diagonal`, `x_brace`

Current key files:

- `pinn_playground/backend/physics_env.py`
- `pinn_playground/backend/pinn_model.py`
- `pinn_playground/backend/training.py`
- `pinn_playground/backend/main.py`
- `pinn_playground/frontend/index.html`
- `pinn_playground/frontend/app.js`

## Why We Are Pausing PINN Work

The current formulation is educational, but several issues make it weak as the main teaching baseline:

1. The PINN is now configured on the same bottom-support plus top traction-patch problem as FEM, but it is still not a trusted reference solver.

2. The geometry for reinforcement is mechanically inconsistent.
   The brace is modeled as a finite-width band in the domain, but the traction-free brace boundary is approximated using brace centerlines.

3. The current frame is too thick.
   Reinforcement effects are visually weaker than they should be, so the educational contrast between unreinforced and reinforced cases is reduced.

4. The current PINN problem is too smooth and too easy.
   The training curve can look "good" even when the stress field is not trustworthy enough for engineering interpretation.

5. Thin frames, corners, and localized loads are exactly where standard PINNs become fragile.
   That is a known issue in the literature, not just a bug in this repo.

## Main PINN Lessons From Discussion

### 1. Why corners and point loads are hard

For a thin metal frame with an inner opening:

- inner corners create stress concentrations and non-smooth local behavior
- braces create sharp geometry transitions
- a true point load creates a singularity

Standard PINNs use smooth global neural networks and are biased toward low-frequency solutions, so they often under-resolve those sharp local features.

### 2. Why this is still worth teaching

This is still an excellent educational problem for PINNs, but **not as the first solver students see**.

The right teaching order is:

1. Solve the mechanics problem with FEM.
2. Build intuition about mesh density, convergence, loads, supports, and stress concentration.
3. Revisit the same problem with PINN.
4. Compare PINN output against FEM and discuss where PINN succeeds or fails.

That sequence better supports the proposal goal of teaching students not to trust AI blindly.

## Recommended Future PINN Stack

When the project returns to PINN development, the preferred direction is to evaluate **DeepXDE** rather than continuing to grow the current custom PyTorch trainer as the main long-term solution.

Reasons:

- it already supports PINN workflows and BC abstractions
- it has residual-based resampling support
- it has hard-constraint output transforms
- it includes multi-scale Fourier-feature networks that help with spectral bias
- it will reduce time spent maintaining PINN plumbing that is not the focus of the project

## Recommended Problem Formulation For PINN v2

Do **not** use a true mathematical point load.

Instead, use:

- a small traction patch on a boundary segment, or
- a small distributed load over a short loaded region

This is more physical, easier for FEM and PINN to share, and much more intuitive for students.

Recommended base mechanics setup:

- 2D plane stress
- thin square or rectangular frame with larger opening
- optional `base`, `diagonal`, `x_brace`
- left support fixed or partially fixed
- small loaded patch on the opposite side
- FEM result treated as reference

## DeepXDE Features To Use Later

### 1. Small-area traction instead of point load

This is the most important modeling change.

- avoids singular stress behavior
- gives a well-posed comparison target
- is easier to explain in class and in the GUI

### 2. Residual-based adaptive refinement

Use DeepXDE's resampling or anchor mechanism to increase point density near:

- load patch
- inner corners
- brace joints
- zones where residual remains high

This is better than the current fixed hotspot heuristic.

### 3. Hard boundary constraints

Use output transforms for displacement Dirichlet BCs where possible.

Benefits:

- reduces BC-loss balancing difficulty
- makes support conditions more reliable
- lets students see the difference between hard and soft enforcement

### 4. Multi-scale Fourier features

Use a multi-scale Fourier-feature network for thin-frame or reinforcement cases.

Benefits:

- better representation of localized stress gradients
- less severe low-frequency bias than a standard tanh MLP

### 5. Loss weighting and curriculum

Plan to expose:

- PDE loss weight
- BC loss weight
- adaptive sampling on/off
- hard vs soft BC mode
- network type: standard MLP vs Fourier-feature network

That gives students a meaningful "naive PINN vs improved PINN" progression.

## Recommended PINN Learning Flow In The GUI

When the project comes back to PINN, the teaching story should be:

1. Load the exact same geometry, material, support, and traction case used in FEM.
2. Show the saved FEM solution first.
3. Train the PINN on the same case.
4. Compare:
   - von Mises field
   - displacement field
   - peak stress
   - error map against FEM
   - training history
5. Let students toggle advanced mitigations:
   - adaptive sampling
   - hard BCs
   - Fourier features
   - denser collocation near stress concentrations

## Recommended Code Direction When PINN Work Resumes

Keep the current PyTorch prototype for reference, but plan a second-generation PINN module around DeepXDE instead of retrofitting everything into the current `training.py`.

Suggested future files:

- `pinn_playground/backend/pinn_problem.py`
- `pinn_playground/backend/pinn_reference.py`
- `pinn_playground/backend/pinn_deepxde.py`
- `pinn_playground/backend/pinn_compare.py`

Responsibilities:

- `pinn_problem.py`: shared geometry, material, support, and load definition used by both FEM and PINN
- `pinn_reference.py`: loading FEM ground-truth result for comparison
- `pinn_deepxde.py`: DeepXDE model construction, BCs, callbacks, and training
- `pinn_compare.py`: error metrics, FEM vs PINN summary data, and response payload formatting

## Acceptance Criteria Before Returning To PINN

Do not resume major PINN development until the FEM module can provide:

- a stable 2D plane-stress baseline
- a thin-frame geometry that is visually and mechanically reasonable
- a localized traction load
- reliable von Mises post-processing
- mesh-convergence evidence
- result payloads reusable by the web GUI

Once those exist, the PINN module can be judged properly.

## Risks To Keep In Mind

1. A thin frame with sharp corners is a good educational problem but a difficult vanilla PINN benchmark.

2. If the PINN is shown without comparison to FEM, students may confuse a smooth-looking answer with a correct answer.

3. A true point load should be avoided for both pedagogy and numerical stability.

4. The project should treat PINN limitations as a learning outcome, not as something to hide.

## Bottom-Line Recommendation

Pause major PINN implementation now.

Build the numerical method workflow first with `scikit-fem`, use that as the trusted baseline, and then return to PINN using DeepXDE with:

- traction-patch loading
- adaptive resampling
- hard BC enforcement
- multi-scale Fourier features
- explicit FEM comparison
