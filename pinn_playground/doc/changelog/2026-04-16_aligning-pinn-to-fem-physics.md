# Changelog - 2026-04-16

## Summary

Today focused on aligning the **engineering problem definition** between the numerical-method baseline and the PINN workflow inside `pinn_playground`.

The goal was **not** to make the PINN suddenly match FEM in quality. The goal was to make both solvers respond to the **same adjustable physical case** so later comparison work is meaningful:

- same frame geometry family
- same frame thickness
- same brace width
- same material inputs
- same bottom support
- same top-edge traction patch

This moves the project away from a situation where FEM and PINN were solving visibly different boundary-value problems, even if the UI looked similar.

## What Changed

### Shared structural problem contract

Refactored:

- `pinn_playground/backend/problem_definition.py`

The backend now has a **shared structural problem definition** used as the common physics layer for both numerical method and PINN.

The shared contract now covers:

- geometry type: `base`, `diagonal`, `x_brace`
- frame thickness
- brace half width
- Young's modulus
- Poisson ratio
- bottom fixed support
- top-edge load patch center and width
- traction vector components

This means the adjustable **physics inputs** are now conceptually the same on both sides, while solver-specific controls remain separate.

### PINN-specific controls remain separate

Kept separate in the PINN path:

- collocation density
- boundary sampling density
- epochs
- loss weights
- network width/depth
- normalization

Kept separate in the numerical path:

- FEM mesh resolution / cells per side

That keeps the alignment focused on the **engineering problem**, not on forcing both solvers to share discretization settings that are naturally different.

## Backend Alignment

### PINN now consumes the shared physical case

Updated:

- `pinn_playground/backend/training.py`
- `pinn_playground/backend/physics_env.py`
- `pinn_playground/backend/pinn_model.py`

The PINN preview and training flow now validate against a config that contains:

- one nested shared structural problem
- one set of PINN-only training and sampling settings

This replaces the earlier demo-style setup where the PINN effectively solved a different problem with:

- left-edge clamp
- right-edge prescribed displacement
- fixed hardcoded frame thickness

### Geometry alignment inside PINN helpers

PINN geometry utilities are no longer tied to hardcoded opening dimensions.

They now derive geometry from the shared structural config for:

- domain masking
- hotspot placement for adaptive sampling
- boundary sampling
- stress-grid masking

This means changing frame thickness or brace width now affects both:

- the numerical solve
- the PINN collocation domain and post-processing mask

## Frontend Alignment

### PINN cell now exposes the same engineering controls

Updated:

- `pinn_playground/frontend/pinn-cell.js`

The PINN cell now exposes the same shared physical controls already present in the numerical cell:

- geometry
- frame thickness
- brace half width
- patch center
- patch width
- Young's modulus
- Poisson ratio

The PINN UI still keeps its own solver-specific controls for:

- sampling strategy
- domain points
- boundary points
- epochs
- PINN architecture
- loss weighting

This gives students the same engineering knobs in both cells while preserving the teaching value of PINN-specific experimentation.

### Teaching copy updated

The PINN cell no longer describes the old right-edge prescribed-displacement example.

It now explains that the PINN is training on the same:

- bottom support
- top traction patch
- shared material and geometry definition

used by the numerical baseline.

## How The PINN Uses A Patch Force Boundary Condition

### Boundary-condition change

The main conceptual change is in:

- `pinn_playground/backend/training.py`

Instead of enforcing a prescribed displacement on the right edge, the PINN boundary-condition loss now treats the problem as:

- **bottom edge fixed**: `u = 0`, `v = 0`
- **top patch loaded**: traction target applied over a selected segment of the top boundary
- **remaining boundary traction-free**

### How the patch load is enforced

For sampled boundary points, the PINN computes:

- displacement field `(u, v)`
- strain from displacement gradients
- plane-stress components `sigma_xx`, `sigma_yy`, `tau_xy`

From those stresses and the local outward normal `(n_x, n_y)`, it computes the traction vector:

$$
\mathbf{t} = \boldsymbol{\sigma} \mathbf{n}
$$

On the loaded top patch, the loss pushes that traction toward the configured target:

$$
\mathbf{t}_{\text{target}} = [t_x, t_y]
$$

So the PINN is no longer told, "move this edge by a chosen displacement." It is told, "produce stresses so that this top patch carries the requested traction."

### Why the traction patch is identified cleanly

The shared load definition provides:

- `patch_center`
- `patch_width`
- `traction_x`
- `traction_y`

During boundary loss evaluation, top-edge sampled points are split into:

- points inside the loaded patch
- points on the rest of the boundary

The loaded subset gets a **traction-matching loss**, while the remaining subset gets a **traction-free loss**.

### Material handling in PINN

The user-facing material inputs now match FEM:

- Young's modulus
- Poisson ratio

Internally, the current PINN implementation still normalizes stiffness during training for numerical stability, while preserving the shared user-facing problem definition.

That means:

- the UI and backend contract are aligned with FEM
- the PINN still has room for future improvement in scaling and fidelity

## Why This Matters

This alignment removes one major source of confusion in the teaching story.

Previously, if FEM and PINN looked different, there were two overlapping explanations:

1. PINNs are harder to train and less trustworthy here.
2. The PINN and FEM were not actually solving the same physical problem.

Now the second issue is substantially reduced. If the PINN result differs, that difference is more honestly attributable to:

- solver quality
- collocation quality
- loss balancing
- network limits
- known PINN difficulty around thin frames, corners, and localized loads

That is a much better basis for the later comparison checkpoint.

## Verification

Verified during development:

- no diagnostics on edited backend and frontend files
- PINN preview payload validated with the new shared structural config
- PINN boundary loss executed with bottom support and top traction patch settings
- PINN stress-grid generation executed with the shared geometry config
- FEM preview/solve smoke test still passed after the shared-contract refactor
- frontend syntax check passed on `pinn_playground/frontend/pinn-cell.js`

## Current Status At End Of Day

Working:

- shared physical-case contract across numerical method and PINN
- aligned geometry/material/load/support controls in the UI
- PINN traction-patch boundary-condition formulation
- FEM behavior preserved after the refactor

Expected and acceptable at this stage:

- PINN result is still **not** as faithful as the numerical result
- visual agreement is limited by PINN approximation quality, not just by config mismatch

Not implemented yet:

- direct FEM-versus-PINN field comparison
- shared automatic value syncing between the two UI cells
- automatic backend generation of a numerical reference during each new PINN run
- stronger PINN calibration or scaling work for more faithful stress predictions

## Recommended Next Steps

1. Add a comparison layer that uses the shared case identity to pair one PINN run with the corresponding numerical reference.
2. Compare at least displacement, von Mises field, and a few scalar summaries such as peak stress and relative error.
3. Decide whether comparison should use:
   - manually matched runs from the two cells, or
   - an automatic numerical solve triggered when a new PINN case is trained.
4. Add a dedicated comparison checkpoint in the shell so students can inspect where PINN agrees, where it fails, and why.
5. Continue improving PINN robustness for localized traction and thin-frame stress concentrations before treating it as anything close to a trusted solver.