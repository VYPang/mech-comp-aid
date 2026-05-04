# Changelog - 2026-04-24

## Summary

This note covers the **PINN Playground** changes made after commit `a815ab63`. The work focused on one practical question that emerged after the earlier Fourier-feature and residual-resampling improvements: **why was the plain traction-driven PINN still under-predicting the FEM stress field, and what is the smallest amount of numerical guidance needed to fix it?**

The answer from both implementation and experiment is now much clearer:

1. A new **Teacher-Guided PINN** mode was added to the training pipeline and web UI.
2. That mode uses sparse **FEM displacement samples** as teacher targets while keeping the same PDE and traction-driven benchmark.
3. Independent experiments with teacher points on the **interior**, **free boundary**, and **load patch** showed that a **small number of load-patch teacher points** is already enough to improve the PINN dramatically.

The main interpretation is that the weak point of the plain PINN is not primarily the interior PDE residual. It is the fact that the crucial loading information is imposed through a **Neumann boundary condition** on the top patch, while the network itself predicts **displacement**. Once the model receives a few displacement anchors on that load patch, training becomes much easier and the stress field improves substantially.

Unrelated edits outside `pinn_playground/` are intentionally omitted from this note.

---

## Core Finding - Load-Patch Guidance Dominates

### What we observed

The new teacher-guided workflow exposed a useful experiment:

- add teacher points only in the interior,
- add teacher points only on the free / support boundary,
- add teacher points only on the load patch,
- compare which intervention improves the PINN most.

The outcome was not symmetric. Interior and free-boundary teacher points can help, but **they are not the main lever**. The strongest improvement comes from adding **only a few load-patch teacher points** using FEM displacement values.

That is an important teaching result because it narrows the explanation. The plain PINN is not failing only because the field is globally complicated. It is failing mainly because the most important boundary information is encoded in a way that is indirect for an MLP displacement model.

### Why this matters

This result is more informative than simply saying “teacher supervision helps.” It shows **where** the supervision matters.

The current PINN already has enough information to learn a broadly plausible displacement field in the interior. What it lacks is a strong local anchor on the loaded boundary, where the traction condition must be matched through derivatives rather than through direct output values.

That means the educational story is now sharper:

- plain PINN struggles because the load patch is specified through traction,
- teacher guidance helps most when it gives the network direct displacement information exactly where the traction was previously indirect,
- the improvement is therefore closely related to the difference between **Neumann** and **Dirichlet** boundary conditions.

---

## PINN Principle - Why Neumann Loading Is Harder Here

### Network output and physics path

The current PINN predicts displacement directly:

$$
(x, y) \mapsto (u_\theta(x,y), v_\theta(x,y))
$$

It does **not** predict stress directly. Stress is derived through the usual linear-elasticity chain:

$$
(u, v)
\rightarrow
\varepsilon
\rightarrow
\sigma
\rightarrow
\sigma n
$$

where, under small strain,

$$
\varepsilon_{xx} = \frac{\partial u}{\partial x},
\qquad
\varepsilon_{yy} = \frac{\partial v}{\partial y},
\qquad
\gamma_{xy} = \frac{\partial u}{\partial y} + \frac{\partial v}{\partial x}
$$

and the interior PDE residual is the equilibrium condition

$$
\nabla \cdot \sigma = 0.
$$

### Dirichlet versus Neumann viewpoint

In a displacement-driven problem, the loaded boundary would be Dirichlet:

$$
u = \bar{u},
\qquad
v = \bar{v}
\qquad \text{on } \Gamma_D.
$$

That is a direct loss on the network output. The MLP only needs to place its predictions close to known values.

In the current benchmark, the top patch is traction-driven, so the loading is Neumann:

$$
\sigma n = \bar{t}
\qquad \text{on } \Gamma_N.
$$

For the top edge, this means the boundary loss is applied through stress components such as

$$
t_x = \sigma_{xx} n_x + \tau_{xy} n_y,
\qquad
t_y = \tau_{xy} n_x + \sigma_{yy} n_y.
$$

So the network is **not** told directly what displacement to output on the load patch. Instead, it is told that the **derivatives** of its output must produce the correct traction after going through the constitutive law.

### Why this is harder for an MLP PINN

This is difficult for a smooth `tanh` MLP for several reasons:

1. The supervision signal is derivative-based rather than output-based.
2. The same model must satisfy both interior equilibrium and traction consistency through the same displacement field.
3. The highest-error region is localized near the top load patch and nearby stress concentrators, while the MLP is biased toward smoother low-frequency fields.
4. A smooth displacement field can reduce global PDE and BC losses without matching the sharp local gradients needed for the correct stress magnitude.

This is the same reason the plain PINN often looked qualitatively reasonable in displacement but still under-predicted peak von Mises stress compared with FEM.

### Why load-patch teacher points help so much

Teacher guidance adds sparse pointwise displacement supervision:

$$
(u_\theta(x_i, y_i), v_\theta(x_i, y_i)) \approx (u_{FEM}(x_i, y_i), v_{FEM}(x_i, y_i)).
$$

When those points are placed on the **load patch**, the model effectively receives a local Dirichlet-like anchor on the very part of the domain where the original physics-only formulation was purely Neumann.

That does **not** change the benchmark into a displacement-driven problem, because the PDE and traction losses are still active everywhere. But it does reduce the ambiguity of the optimization problem by telling the network what displacement scale and direction it should realize on the loaded boundary.

That is why a few load-patch teacher points can outperform a larger number of interior teacher points.

---

## New Training Mode - Teacher-Guided PINN

### Backend design added

The backend now supports a dedicated teacher-guided configuration in `pinn_playground/backend/training.py`:

```python
class TeacherConfig(BaseModel):
    enabled: bool = False
    n_interior: int = Field(default=120, ge=0, le=5000)
    n_boundary: int = Field(default=40, ge=0, le=2000)
    n_load_patch: int = Field(default=20, ge=0, le=500)
    weight: float = Field(default=10.0, gt=0.0, le=1000.0)
    seed: int = 7
```

This config is now part of `TrainingConfig`, so the frontend can request a teacher-guided run through the same training session entry point.

### Loss design

The plain baseline remains:

$$
L_{plain} = w_{PDE} L_{PDE} + w_{BC} L_{BC}.
$$

The teacher-guided mode adds a displacement regression term:

$$
L_{guided} = w_{PDE} L_{PDE} + w_{BC} L_{BC} + w_{teacher} L_{teacher}
$$

with

$$
L_{teacher} = \frac{1}{N} \sum_{i=1}^{N}
\left[
(u_\theta(x_i,y_i) - u_{FEM}(x_i,y_i))^2 +
(v_\theta(x_i,y_i) - v_{FEM}(x_i,y_i))^2
\right].
$$

The key implementation choice is that the teacher target supervises **both** displacement components, because the PINN outputs `(u, v)` directly and this keeps the supervision stable and physically interpretable.

### Teacher source and scaling

Teacher points come from a **high-resolution FEM solve** of the same geometry, support, material, and top traction patch.

The solve is exposed through a new helper in `pinn_playground/backend/fem_solver.py`:

```python
solve_fem_for_teacher(problem, n_cells=180)
```

Because the PINN is trained in normalized traction/material units while the FEM solve is physical, the FEM displacements are rescaled before being used as targets:

$$
u_{train} = u_{FEM,phys} \cdot \frac{E_{phys}}{\text{traction\_scale}}.
$$

This keeps the teacher targets on the same displacement scale the PINN actually sees during optimization.

Files changed:

- `pinn_playground/backend/fem_solver.py`
- `pinn_playground/backend/training.py`

---

## Teacher Point Sampling - Interior, Boundary, Load Patch

### Sampling categories added

Teacher points are now sampled in three independent categories:

- interior points,
- boundary points excluding the traction patch,
- load-patch points on the top loaded segment.

This is implemented in `sample_teacher_points_xy(...)` inside `training.py`.

The separation matters for both pedagogy and experiment design:

- it lets students test where guidance matters,
- it keeps the load patch visible as a distinct supervision region,
- it supports the exact experiment that led to the new Neumann-vs-Dirichlet insight.

### Interpolation of teacher values

The teacher coordinates are not restricted to FEM nodes. The backend interpolates FEM displacements to those sample locations using `scipy.interpolate.griddata` with:

- linear interpolation when available,
- nearest-neighbor fallback if a point falls outside a valid simplex.

That makes the teacher targets smooth enough for sparse supervision while staying tied to the high-resolution numerical solution.

Files changed:

- `pinn_playground/backend/training.py`

---

## Frontend - New Teacher-Guided Checkpoint and Controls

### Progress flow change

The previous placeholder comparison checkpoint in the PINN cell was replaced by an actual **Teacher-Guided PINN** checkpoint.

In `pinn_playground/frontend/progress-state.js`, the third PINN stage is now:

- `pinn-teacher`
- title: **Teacher-Guided PINN**
- subtitle: sparse FEM displacement labels are used to lift the stress magnitude ceiling

This makes the teaching flow more explicit:

1. preview collocation points,
2. train plain PINN,
3. train teacher-guided PINN.

### New controls exposed

The teacher-guided checkpoint adds a dedicated **Teacher Supervision** section in `pinn_playground/frontend/pinn-cell.js` with sliders for:

- interior teacher points,
- boundary teacher points,
- load-patch teacher points,
- teacher loss weight.

The same file now also:

- sends the `teacher` block in the training config,
- requests teacher preview overlays,
- records teacher loss in the live loss history,
- treats `pinn-teacher` as a separate runnable training stage rather than a continuation of plain PINN.

Files changed:

- `pinn_playground/frontend/progress-state.js`
- `pinn_playground/frontend/pinn-cell.js`
- `pinn_playground/frontend/api.js`

---

## Frontend Visualization - Teacher Overlay and Ordering Fixes

### Teacher-point overlay

The collocation plot in `pinn_playground/frontend/plots.js` now supports `payload.teacher_points` and renders:

- teacher interior points,
- teacher boundary points,
- teacher load-patch points.

Teacher points use a distinct pink color and smaller markers so students can see that they are an additional supervision layer rather than a replacement for collocation.

### Layering correction

During implementation, the point-cloud renderer needed a small but important correction: Plotly trace ordering only behaves predictably if all relevant plot layers use the same trace engine. The visualization was therefore adjusted so that the point cloud and load-patch line all render through standard `scatter` traces, giving a deterministic visual stack.

The intended order on every redraw is:

1. teacher points,
2. load patch,
3. boundary points,
4. interior points.

This matters because teacher points must remain visible while new collocation clouds stream in during training and resampling.

### Teacher-loss plot

The bottom loss chart now includes a fourth trace:

- **Teacher Loss**

when teacher guidance is active.

Files changed:

- `pinn_playground/frontend/plots.js`
- `pinn_playground/frontend/pinn-cell.js`

---

## API and Streaming Additions

### New preview endpoint

The backend now exposes:

```text
POST /api/teacher-preview
```

This returns the teacher point coordinates grouped by category without requiring a full training session. The UI uses it to overlay teacher points immediately when sliders change.

### New WebSocket payloads

The training stream now sends a teacher preview payload and includes teacher loss in the periodic metrics updates.

This means the browser can show both:

- where the teacher points are,
- how much they are contributing during optimization.

Files changed:

- `pinn_playground/backend/main.py`
- `pinn_playground/backend/training.py`
- `pinn_playground/frontend/api.js`
- `pinn_playground/frontend/pinn-cell.js`

---

## Cache Refresh and UI Reliability

The frontend asset version was bumped from the earlier shell version to:

- `checkpoint-shell-12`

across the frontend module graph.

This was necessary because teacher-guided training touched several interconnected ES modules at once:

- new checkpoint state,
- new teacher preview API,
- new controls,
- new plot ordering,
- new loss traces.

Without a cache bump, the browser could mix old and new modules and produce misleading UI behavior.

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
- backend imports succeed with the new teacher configuration,
- `POST /api/teacher-preview` returns the expected grouped payload,
- the teacher dataset builds successfully from the high-resolution FEM solve,
- the streamed training session emits `teacher_preview`, `metrics`, `fem_baseline`, and `complete` messages as expected,
- a short teacher-guided smoke run showed the teacher loss decreasing over training,
- the collocation plot now accepts teacher overlays and preserves the intended top-to-bottom draw order,
- the cache-busted frontend module graph serves the teacher-guided UI path.

---

## Current Status

Working:

- teacher-guided training is implemented as a real PINN checkpoint, not just a plan,
- teacher points can be assigned independently to the interior, boundary, and load patch,
- the backend samples those points from a high-resolution FEM displacement field,
- the training loss now includes an explicit FEM displacement supervision term,
- the frontend previews teacher points and plots teacher loss live,
- the load-patch experiment can now be performed directly in the UI,
- the resulting evidence strongly suggests that the dominant optimization difficulty is the traction-driven Neumann boundary on the top patch.

Most important experimental implication:

- **a few load-patch teacher points are sufficient to produce a much better PINN result**, which supports the interpretation that the model mainly needed direct displacement guidance where the original boundary condition was only traction-based.

Still true by design:

- the benchmark itself remains traction-driven,
- the teacher points do not replace the PDE or BC loss,
- the model is still an MLP displacement PINN, so very sharp local gradients remain more difficult than broad low-frequency structure.

---

## Next Stage

The next useful step is no longer to ask only whether teacher guidance helps. It is to ask **how little guidance is enough** and how that maps to boundary-condition type.

Recommended next steps:

1. Record controlled comparisons of interior-only, boundary-only, load-patch-only, and mixed teacher-point placements for the report.
2. Quantify how teacher loss weight changes the balance between physics consistency and supervised regression.
3. Turn the new load-patch result into a dedicated teaching explanation of why Neumann-driven PINNs are harder than Dirichlet-driven ones when the network outputs displacement.
4. If further refinement is needed, explore whether teacher guidance should stay sparse and local rather than being spread uniformly across the whole domain.