# Changelog - 2026-04-23

## Summary

This note covers the **PINN Playground** changes made after commit `a9fc6fa` (`fix(pinn): add FEM-vs-PINN comparison`). The work focused on one practical problem: **plain PINN training driven only by PDE residual and boundary-condition loss was still too smooth and too slow to recover the localized stress features seen in the FEM baseline**, especially near corners and the traction patch.

To address that, today introduced three connected changes:

1. **Higher-frequency model inputs** via random Fourier features.
2. **Residual-adaptive domain resampling** so collocation density can follow where the PINN is still wrong.
3. **Frontend and cache-refresh updates** so students can actually see and control those training changes in the web UI.

An additional correction removed an unnecessary FEM-baseline rescaling step. The comparison view is now cleaner conceptually: FEM and PINN are already in compatible stress units for this traction-driven linear-elasticity setup.

Unrelated edits outside `pinn_playground/` are intentionally omitted from this note.

---

## Core Limitation — Pure PDE + Boundary Loss Training

### What we observed

Even after the earlier traction-scaling fix, the PINN was still limited by the standard training recipe:

- domain loss = equilibrium residual at sampled interior points
- boundary loss = support and traction constraints at sampled boundary points

That setup is mathematically valid, but in practice it is **weak supervision** for sharp stress fields. A smooth `tanh` MLP trained only against those two losses tends to spend most of its capacity fitting the large-scale displacement field first, while **high-gradient local behavior** near the load patch, hole corners, and brace joints converges much more slowly.

The result is a familiar PINN failure mode:

- displacement looks plausible,
- global equilibrium loss decreases,
- but the local stress field remains too smooth or too noisy compared with FEM.

### Why this matters pedagogically

For teaching, that limitation is useful to surface explicitly. Students should see that “minimize PDE + BC loss” is **not automatically sufficient** to recover engineering-quality local stress concentrations on a CPU-friendly training budget.

Today’s changes improve that behavior, but they do **not** remove the underlying limitation. They are better thought of as the last round of improvements to a pure collocation-based PINN before moving to the next stage.

---

## PINN Model — Fourier Features

### Motivation

The current network is a `tanh` MLP, which inherits the standard **spectral bias** problem: low-frequency modes are learned early and high-frequency structure is learned late. That is exactly the wrong inductive bias for corner-driven stress concentrations.

### Change applied

In `pinn_playground/backend/pinn_model.py`, the `PINN` class now supports **random Fourier feature encoding** before the MLP:

```python
proj = 2.0 * torch.pi * (coords @ self.fourier_B)
encoded = torch.cat([torch.sin(proj), torch.cos(proj)], dim=-1)
```

The projection matrix is:

- random,
- fixed after initialization,
- seeded from the training seed,
- scaled by a configurable bandwidth `sigma`.

When enabled, the network no longer sees only normalized `(x, y)` coordinates. It sees a richer input basis that can represent sharper spatial variation without needing an unrealistically deep or wide pure-MLP stack.

### Frontend exposure

The PINN cell now includes:

- a **Fourier Features** checkbox,
- a **Fourier Bandwidth (σ)** slider.

This lets students turn the encoding on and off and directly see the tradeoff:

- small `σ` behaves more smoothly,
- large `σ` injects more high-frequency capacity,
- too much frequency can also destabilize training.

Files changed:

- `pinn_playground/backend/pinn_model.py`
- `pinn_playground/backend/training.py`
- `pinn_playground/frontend/pinn-cell.js`

---

## Training Improvements — Capacity and Residual-Adaptive Resampling

### Higher-capacity defaults

The default PINN training configuration in `training.py` was raised from a lighter demo setup to a more realistic teaching baseline:

- `hidden_dim`: `48 -> 96`
- `n_hidden_layers`: `4 -> 5`
- `stress_grid_n`: `40 -> 60`

Matching frontend defaults were updated in `pinn-cell.js`.

The intent was not to make the network large for its own sake, but to give the model enough capacity that the new Fourier encoding and comparison plots are worth using.

### Residual-adaptive resampling

Added a residual-adaptive density routine in `pinn_playground/backend/training.py`:

```python
_residual_adaptive_resample(...)
```

At a configurable interval, the trainer now:

1. draws a candidate pool inside the geometry,
2. evaluates the squared PDE residual at each candidate,
3. samples new interior points with probability proportional to `residual ** power`,
4. mixes in a uniform fraction so the full domain does not disappear from training.

This is a pragmatic way to spend collocation budget where the network is currently underperforming, instead of keeping all interior points frozen for the full run.

### Important correction

Residual resampling now runs **only when `sampling_strategy == "adaptive"`**. That keeps the user-facing meaning of the sampling selector honest:

- `uniform` means no adaptive redistribution,
- `adaptive` means hotspot-aware preview sampling plus residual-driven refresh during training.

### Frontend exposure

The **Residual Resample Every** slider is now grouped under **Sampling** rather than **PINN and Training**, because it changes the collocation strategy rather than the optimizer itself.

Files changed:

- `pinn_playground/backend/training.py`
- `pinn_playground/frontend/pinn-cell.js`

---

## FEM Baseline Comparison — Unit Correction

### Previous assumption

`_build_fem_baseline()` previously rescaled the FEM stress grid by:

```python
z_np *= traction_scale / young_physical
```

That step came from an earlier assumption that the FEM stress field and the PINN post-processed stress field were still living in different units.

### Correct reasoning

For this problem, that extra rescaling is unnecessary.

- The FEM solve already uses the physical traction boundary condition.
- In linear elasticity under traction loading, the stress field is independent of Young’s modulus in the way it had been feared here.
- The PINN display path already maps its training-scale stress back through `physical_material.young = traction_scale`.

So both sides of the comparison are already in the same practical stress units for display. The extra rescale was removed.

This makes the comparison path easier to explain: the FEM baseline is now passed through directly instead of being “corrected” a second time.

Files changed:

- `pinn_playground/backend/training.py`

---

## Frontend — Live Collocation Feedback and Cache Refresh

### Live resample plot updates

The training WebSocket already streamed metrics and FEM-baseline data. It now also handles:

```json
{ "type": "resample", ... }
```

When the backend replaces the interior collocation set, the frontend updates `state.latestPreview.domain_points` and re-renders the **Collocation Points** plot. Students can now see that adaptive resampling is not just a hidden backend trick; the cloud actually changes during training.

### Cache-busting fix

The frontend asset query string was bumped from `checkpoint-shell-8` to `checkpoint-shell-10` across:

- `index.html`
- `app.js`
- `shell.js`
- `pinn-cell.js`
- `numerical-cell.js`

This was necessary because restarting the backend alone does **not** guarantee that the browser reloads changed ES modules or CSS. Without a new asset version, the page could continue running stale frontend code even though the server process was fresh.

That behavior explains why some UI changes appeared to “not take effect” after a backend restart until the asset version changed or the browser was hard-refreshed.

Files changed:

- `pinn_playground/frontend/index.html`
- `pinn_playground/frontend/app.js`
- `pinn_playground/frontend/shell.js`
- `pinn_playground/frontend/pinn-cell.js`
- `pinn_playground/frontend/numerical-cell.js`

---

## Verification

Verified during development:

- no diagnostics reported for edited backend and frontend files,
- Fourier-feature parameters flow from frontend config to backend model construction,
- residual resampling emits a dedicated WebSocket message and the collocation plot updates when it arrives,
- resampling is gated on adaptive sampling mode,
- FEM baseline comparison path no longer applies the old extra stress rescaling,
- frontend cache version bump forces the browser to load the updated module graph.

---

## Current Status

Working:

- PINN supports optional random Fourier feature input encoding
- default training capacity is stronger than the earlier demo baseline
- residual-adaptive interior resampling is implemented in the trainer
- collocation preview updates live when resampling occurs during training
- sampling controls are grouped more coherently in the PINN UI
- frontend asset cache busting now reflects the new module graph
- FEM-vs-PINN baseline comparison uses simpler and more defensible unit handling

Still limited by design:

- pure PDE-loss plus boundary-loss training is still not efficient enough to recover FEM-quality local stress concentrations under a short teaching-session budget
- Fourier features and residual resampling improve convergence, but they do not fully solve the fidelity gap near sharp local features

---

## Next Stage

The next stage should move toward **superresolution**, rather than continuing to spend more complexity on pure collocation-only training.

Reasoning:

- the current PINN pipeline is already near the point of diminishing returns for a “PDE residual + BC residual only” lesson,
- adding more width, more epochs, or more resampling will continue to increase runtime before it reliably closes the FEM gap,
- superresolution gives a clearer next teaching story: use a coarse, fast field as the low-frequency backbone, then learn or reconstruct the higher-frequency local structure that the plain PINN misses.

Recommended next steps:

1. Define what “superresolution” means in this project: grid upsampling, patch refinement near stress concentrators, or a teacher-student pipeline driven by FEM data.
2. Keep the current PDE+BC PINN as the coarse baseline and comparison anchor rather than replacing it.
3. Design the next UI checkpoint around “coarse field vs refined field” so students can see why the extra stage exists.
4. Avoid adding more optimizer complexity to the current pure-PINN stage unless it directly supports that superresolution workflow.