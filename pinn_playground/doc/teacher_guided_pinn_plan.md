# Teacher-Guided PINN Plan

## Purpose

This note records the agreed next step for the PINN Playground after the current plain PINN baseline under-performed on the traction-driven frame benchmark.

The goal is **not** to replace the existing benchmark. The goal is to keep the same traction-driven mechanics problem and add a new PINN module that uses sparse numerical displacement samples as teacher guidance during training.

This note is intended to support both implementation and later report writing.

## Agreed Direction

The project will keep the current **traction-driven** benchmark for both FEM and PINN:

- same geometry
- same material
- same bottom support
- same top traction patch
- same free boundaries elsewhere

The new module will add a **teacher-guided PINN** mode under the PINN cell.

In that mode:

- the FEM solution is still the trusted reference
- the PINN is still trained on the PDE residual and the same boundary conditions
- the training loss also includes sparse displacement samples extracted from a **high-resolution FEM solve**

This can be described in two equivalent ways depending on the report emphasis:

- **teacher-guided PINN** when the number of numerical samples is sparse and they act as anchors
- **superresolution-style refinement** when the number of numerical samples is large enough that the network is strongly guided toward a high-fidelity field

For implementation and UI naming, **Teacher-Guided PINN** is the safer label for the first version because it matches the intended sparse-sample workflow.

## Why We Are Not Changing The Benchmark

Changing the top loading from traction to prescribed displacement would make the PINN easier to train, but it would also change the physical problem.

That path is valid in principle, but it would answer a different question:

- current question: how well does a PINN solve the current traction-driven frame problem?
- different question: how well does a PINN solve a displacement-driven frame problem?

For the teaching story in this project, it is better to keep the benchmark fixed and make the improvement explicit:

1. plain PINN struggles on the traction-driven case
2. teacher guidance helps the same case train more reliably

That preserves a clean apples-to-apples comparison.

## Why Pure PINN Training Is Difficult Here

This section should be directly reusable in the report.

### Short explanation

The current PINN predicts displacement, but the main external loading is imposed as a **traction** boundary condition rather than a prescribed displacement. That makes optimization harder because the network is not told directly what displacement to produce on the loaded boundary.

Instead, the model must discover a displacement field whose **derivatives** generate the correct stress field, whose boundary traction matches the applied load patch, and whose interior stresses also satisfy equilibrium.

### Output and loss structure

The current network output is the displacement field:

$$
(x, y) \mapsto (u(x,y), v(x,y))
$$

Stress is not predicted directly. It is derived through the sequence:

$$
(u, v) \rightarrow \text{strain} \rightarrow \text{stress} \rightarrow \text{traction / von Mises}
$$

That means the traction boundary condition is enforced only after several transformations:

$$
(u, v)
\rightarrow
\left(\frac{\partial u}{\partial x}, \frac{\partial u}{\partial y}, \frac{\partial v}{\partial x}, \frac{\partial v}{\partial y}\right)
\rightarrow
(\sigma_{xx}, \sigma_{yy}, \tau_{xy})
\rightarrow
t = \sigma n
$$

### Why traction is harder than displacement for PINN training

If the loaded boundary were prescribed with displacement, the PINN could be told directly:

$$
u = u_{target}, \quad v = v_{target}
$$

That is a direct constraint on the network output.

In the current problem, the loaded patch uses a Neumann condition:

$$
t_x = \sigma_{xx} n_x + \tau_{xy} n_y
$$

$$
t_y = \tau_{xy} n_x + \sigma_{yy} n_y
$$

So the network does not receive direct output supervision there. It only receives a loss on a derived quantity that depends on displacement gradients.

This is harder for several reasons:

1. The signal is derivative-based rather than output-based.
2. The PDE residual also depends on stress derivatives, so the training objective is dominated by higher-order structure.
3. The stress concentrations of interest are localized near corners, brace joints, and the traction patch, while the network has a strong bias toward smoother low-frequency solutions.
4. A smooth field can reduce PDE and boundary loss without reproducing the correct peak stress magnitude.

This explains the observed behavior in the current benchmark:

- the PINN can learn a plausible displacement field
- the global losses can decrease
- the stress field can still remain too smooth and under-predict peak von Mises stress compared with FEM

### Why teacher guidance helps

Teacher guidance adds sparse pointwise displacement information from the numerical solution of the **same** traction-driven problem.

That means the loss is no longer trying to infer the entire displacement field only through PDE residual and traction constraints. It also receives local anchors of the form:

$$
(u_{PINN}, v_{PINN}) \approx (u_{FEM}, v_{FEM})
$$

at selected sample locations.

This does not change the benchmark. It adds trustworthy observations to a problem that is otherwise weakly supervised.

## Agreed Teacher-Guided Design

### 1. Training mode

The new module will be a **new PINN training mode from scratch**.

It will not inherit weights from the plain PINN training run.

Reasoning:

- the teaching story should show that pure physics-only PINN training is difficult
- the teacher-guided model should be understood as a separate module, not a continuation trick
- training from scratch makes the comparison between plain PINN and teacher-guided PINN easier to explain

### 2. Teacher source

Teacher samples will come from a **high-resolution FEM solve** for the same physics case.

Reasoning:

- the teacher should be stable and trustworthy
- the teacher quality should not change with the educational mesh slider in the numerical cell
- the PINN module should always be compared against a fixed high-quality reference

### 3. Teacher target

The teacher loss will supervise **both displacement components**:

$$
u(x_i, y_i), \quad v(x_i, y_i)
$$

Reasoning:

- the PINN directly outputs displacement, so this is the cleanest supervision target
- the loss stays simpler and more stable than direct stress supervision
- supervising both components gives a stronger anchor than supervising only vertical displacement

### 4. Teacher point categories

The UI will expose **three independent controls** for the number of teacher points:

- interior teacher points
- boundary teacher points
- load-patch teacher points

All three groups will use **uniform sampling** within their own region.

Reasoning:

- this is easy to explain in the interface
- it lets students see how different teacher-point locations affect learning
- separating the counts makes the experiment design more explicit than a single blended teacher-point budget

### 5. Teacher-point visualization

Teacher points will be drawn on the same Plotly view as the collocation preview.

Visualization rule:

- same color for all teacher points
- smaller markers than the collocation points
- rendered on top of the collocation cloud so they remain visible

Reasoning:

- the student should see that teacher points are a second supervision layer, not a replacement for collocation
- using one color keeps the plot readable
- smaller markers preserve the visibility of the existing collocation cloud

## Proposed Learning Flow

The PINN cell should become a four-stage story:

1. Preview collocation points
2. Train plain PINN
3. Train teacher-guided PINN
4. Compare outcomes through the live stress and error views already used during training

The current placeholder comparison checkpoint should be repurposed into the new teacher-guided checkpoint.

Reasoning:

- the existing compare-only checkpoint is currently weak as a standalone teaching step
- the guided-training checkpoint is a more meaningful third stage in the same cell
- the comparison still happens naturally through the existing stress/error displays

## Loss Design

### Plain PINN baseline

The current baseline remains:

$$
L_{plain} = w_{PDE} L_{PDE} + w_{BC} L_{BC}
$$

where:

- $L_{PDE}$ is the equilibrium residual loss in the interior
- $L_{BC}$ contains bottom support, top traction patch, and traction-free boundary terms

### Teacher-guided PINN

The new mode will add a supervised displacement term:

$$
L_{guided} = w_{PDE} L_{PDE} + w_{BC} L_{BC} + w_{teacher} L_{teacher}
$$

with:

$$
L_{teacher} = \frac{1}{N} \sum_{i=1}^{N}
\left[
(u_{PINN}(x_i, y_i) - u_{FEM}(x_i, y_i))^2 +
(v_{PINN}(x_i, y_i) - v_{FEM}(x_i, y_i))^2
\right]
$$

The extra UI control required here is the **teacher loss weight**.

Reasoning:

- the new module needs an explicit knob for how strongly the teacher anchors the solution
- this allows a clear experiment from weak guidance to strong guidance

## UI Plan

### Existing plain PINN checkpoint

Keep the current plain PINN checkpoint largely unchanged so it remains the baseline demonstration.

### New teacher-guided checkpoint

Add a new control surface dedicated to teacher-guided training, separate from the plain PINN training controls.

Minimum new controls:

- teacher interior points
- teacher boundary points
- teacher load-patch points
- teacher loss weight

Recommended wording:

- `Teacher Interior Points`
- `Teacher Boundary Points`
- `Teacher Load-Patch Points`
- `Teacher Loss Weight`

This checkpoint should also have its own run button so the workflow reads as a new training module rather than a continuation of the plain PINN run.

## Backend Plan

### 1. High-resolution teacher solve

Add a backend path that generates or reuses a high-resolution FEM result for the current physics case.

Responsibilities:

- solve the same geometry / material / support / load case at high resolution
- expose access to displacement values for teacher sampling
- keep this separate from the interactive numerical-cell mesh resolution

### 2. Teacher point sampling

Add teacher-point samplers for:

- interior domain
- solid boundary
- top load patch

All three should be uniform in their own target region.

The sampler output must include:

- coordinates
- point category
- target displacement values from FEM

### 3. Teacher-guided training session

Add a second training path alongside the current plain PINN training session.

Responsibilities:

- build the same PINN architecture as plain mode
- sample teacher points from the high-resolution FEM result
- add teacher loss during optimization
- stream teacher-point preview data to the frontend
- continue streaming stress, loss, and optional FEM comparison data during training

### 4. WebSocket payloads

Extend the existing live payloads so the frontend can render teacher points distinctly from plain collocation points.

Suggested additions:

- teacher-point preview payload
- teacher-point counts by category
- teacher loss in the live metrics payload

## Frontend Plan

Files likely affected:

- `pinn_playground/frontend/pinn-cell.js`
- `pinn_playground/frontend/plots.js`
- `pinn_playground/frontend/progress-state.js`
- `pinn_playground/frontend/shell.js`

Expected changes:

1. Replace the placeholder comparison checkpoint with a teacher-guided training checkpoint.
2. Add a separate control form for teacher-guided training.
3. Add teacher-point overlays to the collocation figure.
4. Show teacher loss in the live training view.
5. Keep the existing stress/error plots so the student can compare plain PINN and guided PINN behavior.

## Backend Files Likely Affected

Files likely affected:

- `pinn_playground/backend/training.py`
- `pinn_playground/backend/fem_solver.py`
- `pinn_playground/backend/physics_env.py`
- `pinn_playground/backend/problem_definition.py`
- possibly `pinn_playground/backend/main.py` or related API transport code if a separate endpoint or training mode flag is needed

## Implementation Sequence

### Phase 1. Teacher data plumbing

Add the backend ability to query a high-resolution FEM displacement field and sample teacher points from it.

Why first:

- all later work depends on having reliable teacher targets
- this is the cleanest place to validate scaling and data transport before touching the UI heavily

### Phase 2. Guided-training backend

Add the teacher-guided loss term and WebSocket streaming.

Why second:

- once teacher data exists, the new training mode becomes a local extension of the current training loop
- training metrics can be validated before the final UI polish

### Phase 3. PINN checkpoint and controls

Repurpose the third PINN checkpoint into the teacher-guided module and add the new sliders / run controls.

Why third:

- the control surface should be wired only after the backend contract is stable

### Phase 4. Visualization polish

Overlay teacher points and expose teacher loss in the live plots.

Why last:

- plotting depends on settled payload shapes
- the visual polish is easier once the data path is already working

## Risks And Notes

1. If the teacher loss is too strong, the module stops feeling like a physics-guided PINN and starts behaving like a strongly supervised regression model.

2. If the teacher-point counts are too low, the guided model may still under-resolve the peak stress field.

3. If the teacher-point counts are too high, the teaching story shifts from "guided PINN" toward a dense supervised surrogate.

4. Because the teacher target is displacement rather than stress, the improvement in peak von Mises may still depend on how well sharper displacement gradients are recovered.

5. The first implementation should prioritize clarity and stable behavior over adding many guidance heuristics at once.

## Bottom Line

The next module should keep the current traction-driven benchmark and add a **teacher-guided PINN** training mode that uses sparse high-resolution FEM displacement samples as extra supervision.

That design preserves the current mechanics problem, makes the plain PINN limitation visible, and provides a clean educational story for why extra guidance is needed when a PINN is trained under traction-driven boundary conditions.