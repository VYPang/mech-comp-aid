# FEM Plan

## Goal

Build a **numerical-method playground** for 2D plane-stress structural analysis using `scikit-fem`, then use it as the trusted baseline for the later PINN module.

The FEM module should:

- preserve the same interactive spirit as the current PINN UI
- teach mesh, loads, supports, and convergence before students see PINN
- produce reusable result payloads for later FEM-vs-PINN comparison

## High-Level Product Direction

The project should not merge FEM and PINN into one overloaded dashboard with all controls visible at once.

The better flow is:

1. `Numerical Playground` first
2. `PINN Playground` second
3. same visual language, same geometry/load case, shared comparison data

Recommended route structure:

- `/` overview page with module cards and recommended sequence
- `/numerical/` FEM page for the classical solver
- `/pinn/` PINN page for the AI solver

This keeps the experience sequential without hiding the connection between the two solvers.

## Recommended UI Strategy

Keep the same broad layout pattern already used in the PINN page:

- top controls in collapsible groups
- two main plots side by side
- one wide plot below them

For FEM, that becomes:

- left plot: mesh / boundary-condition / load preview
- right plot: von Mises stress or deformed shape result
- bottom plot: convergence study, mesh-refinement history, or solver statistics

This gives students a familiar interaction model without pretending FEM has "training curves."

## Solver Scope For Phase 1

Start with a static 2D linear elasticity solver in plane stress.

Core assumptions:

- small displacement
- isotropic linear elastic material
- 2D plane stress
- one geometry family shared with PINN

Initial user-facing controls:

- geometry: `base`, `diagonal`, `x_brace`
- frame thickness or opening size
- reinforcement thickness
- Young's modulus `E`
- Poisson ratio `nu`
- load magnitude
- load patch size
- mesh density
- element order, if performance permits

## Recommended Load and Boundary Conditions

Use a **small traction patch**, not a true point load.

Why:

- physically more realistic
- easier to explain to students
- works naturally in FEM
- can later be reused by PINN without a singularity

Recommended default case:

- bottom boundary fixed
- a small traction patch is applied on the `top` edge
- the remaining outer boundary segments are traction-free
- inner hole and brace surfaces traction-free

Optional later variants:

- allow partial rather than full-edge supports if needed later
- later compare top-edge loading with other load directions if the baseline remains clear
- explore symmetric or multi-patch loading after the baseline case is stable

## scikit-fem Approach

Use the built-in elasticity helpers:

- `plane_stress(E, nu)`
- `lame_parameters(...)`
- `linear_elasticity(...)`
- `linear_stress(...)`

Recommended displacement space:

- `ElementVector(ElementTriP2())` for the main solver

Reason:

- better stress/displacement quality than the cheapest P1 option
- still reasonable for an educational 2D app

Possible fallback for speed:

- `ElementVector(ElementTriP1())`

## Geometry Strategy

This is the most important implementation decision.

### Phase 1 recommendation

Start with a **programmatic mesh** and simple tagging in Python.

Why:

- fewer moving parts
- easier to debug
- faster to get a working numerical baseline
- no external meshing tool required for the first milestone
- boundary tags for `bottom`, `left`, `right`, and `top` can be created directly with `with_boundaries(...)`

Possible approach:

- build a rectangular or square outer domain
- subtract the central opening logically by masking elements
- represent braces as additional solid regions in the mask
- tag boundaries with `with_boundaries(...)`

### Phase 2 recommendation

Move to **Gmsh-based geometry** once the numerical solver is stable.

Why:

- thin frame and brace geometry will be cleaner
- boundary tags for load patches are easier to control
- mesh quality near corners and slender members will be better
- future refinement and geometry variation become more robust

## Is the `gmsh` Python package required?

Not for the first FEM milestone.

You can get a working version without `gmsh` if you:

- generate a simple mesh programmatically, or
- pre-generate `.msh` assets outside the app and load them with `Mesh.load(...)`

However, for the **thin metal frame with reinforcement**, I strongly recommend planning for Gmsh later.

Best practical position:

- **not strictly required now**
- **likely very useful later**

When Gmsh becomes useful:

- runtime generation of clean thin-frame meshes
- named boundaries for load patches and supports
- better control of local element size near corners, braces, and load zones

## Proposed Backend Architecture

Add FEM-specific modules instead of mixing all numerical code into the existing PINN files.

Suggested files:

- `pinn_playground/backend/problem_definition.py`
- `pinn_playground/backend/fem_geometry.py`
- `pinn_playground/backend/fem_solver.py`
- `pinn_playground/backend/fem_post.py`
- `pinn_playground/backend/fem_api.py`

### File responsibilities

`problem_definition.py`

- shared material, geometry, support, and load schemas
- one source of truth used later by both FEM and PINN
- enforce the initial rule that the support is on `bottom` and the load is allowed only on `top`

`fem_geometry.py`

- geometry creation
- mesh generation or mesh loading
- boundary and subdomain tagging
- generation of preview payloads for the frontend
- explicit tagging of the fixed bottom edge and the top load edge for visualization and assembly

`fem_solver.py`

- basis creation
- stiffness assembly
- traction assembly over a `FacetBasis`
- Dirichlet BC application
- linear solve
- validation that the chosen load definition uses the supported top-edge loading pattern

`fem_post.py`

- deformed coordinates
- stress recovery
- von Mises calculation
- scalar summary metrics
- convergence-study helpers

`fem_api.py`

- Pydantic request/response models
- result serialization for FastAPI

## Planned API Surface

Recommended endpoints:

- `POST /api/fem/preview`
- `POST /api/fem/solve`
- `POST /api/fem/convergence`

### `POST /api/fem/preview`

Returns:

- mesh coordinates and connectivity
- tagged support on `bottom`
- load patch visualization on `top`
- scalar metadata such as element count

Purpose:

- update immediately when controls change
- gives the same fast feedback loop the current PINN collocation preview provides

### `POST /api/fem/solve`

Returns:

- displacement field
- stress field
- von Mises field
- deformed mesh preview data
- scalar metrics:
  - max von Mises
  - max displacement
  - total DOFs
  - solve time

This can be synchronous at first because static 2D linear FEM should be fast.

### `POST /api/fem/convergence`

Runs a small refinement study over several mesh densities and returns:

- mesh size or DOFs
- max von Mises
- monitored displacement
- solve time per case

This bottom chart is the best numerical analogue to the PINN training curve.

## Data Contracts For Later PINN Comparison

Design the FEM payloads now so later comparison is easy.

Each solved case should carry:

- problem definition hash or case ID
- geometry type
- material values
- fixed-edge definition
- load patch definition
- support definition
- mesh density metadata
- result grid or interpolation-ready field data
- scalar summary metrics

The future PINN page should be able to load a FEM case with the same case ID and compare directly.

## Frontend Integration Plan

### Step 1: add a numerical page

Create a new frontend entry, for example:

- `pinn_playground/frontend/numerical.html`
- `pinn_playground/frontend/numerical.js`

This page should mirror the current visual language but swap PINN-specific concepts for FEM-specific ones.

### Step 2: keep the current PINN page separate

Do not immediately merge the FEM controls into the existing `index.html`.

That would make the page too dense and confuse the educational flow.

### Step 3: add a shared landing page

Use the root page to explain the intended learning sequence:

1. Explore numerical method
2. Understand mesh and convergence
3. Move to PINN
4. Compare against FEM baseline

## Recommended Interactive Features For FEM

To preserve the "playground" feel, the numerical page should include:

- live mesh preview when geometry or mesh density changes
- visible support markers and load-patch highlight
- solve button for the current case
- convergence-study button for multiple mesh levels
- toggle between stress view and deformed-shape view
- short guide box that reacts to settings

Example guide-box logic:

- coarse mesh warning
- very small load patch warning
- high Poisson ratio caution
- note that stress concentration near corners needs finer mesh

## scikit-fem Implementation Notes

From the bundled docs/examples, the core patterns are already available:

- vector basis with `ElementVector(...)`
- elasticity assembly with `linear_elasticity(...)`
- traction loading through `FacetBasis` and `LinearForm`
- stress post-processing with `linear_stress(...)` and `sym_grad(...)`
- von Mises from projected stress components

That means the main project-specific work is:

- geometry generation
- boundary tagging
- result serialization
- GUI integration

Not the elasticity mathematics itself.

## Development Phases

### Phase 1: shared problem definition

Deliver:

- common geometry/material/load schemas
- one default thin-frame problem
- one traction-patch load on `top`
- fixed support on `bottom`

### Phase 2: first working FEM solve

Deliver:

- mesh generation
- support/load tags
- single static solve
- von Mises output
- validation of the supported top-edge loading configuration

### Phase 3: frontend numerical playground

Deliver:

- preview endpoint
- solve endpoint
- numerical page with mesh and stress plots

### Phase 4: convergence study

Deliver:

- refinement sweep endpoint
- bottom convergence chart
- guide-box hints based on numerical quality

### Phase 5: prepare PINN comparison

Deliver:

- shared case IDs
- reusable result format
- reference-data loader for future PINN page

## Acceptance Criteria

The FEM module is ready to become the project baseline when it can:

- solve the selected 2D plane-stress frame case robustly
- display mesh, fixed bottom support, and top-edge traction patch clearly
- show von Mises stress and deformed shape
- run a small refinement study
- demonstrate mesh sensitivity near corners and reinforcement
- export enough structured data for later FEM-vs-PINN comparison

## Final Recommendation

Start with `scikit-fem` using a simple programmatic mesh so the numerical workflow appears quickly in the GUI.

Do **not** block the first FEM milestone on Gmsh.

But for the final thin-frame-with-brace version, especially if geometry quality and boundary tagging matter, plan to adopt Gmsh or pre-generated `.msh` assets soon after the first solver is working.
