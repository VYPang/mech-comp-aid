// Numerical/FEM tutorial content. This is the first WebUI integration pass:
// concise review prose plus small interactive figures that make each chapter
// manipulable before students enter the FEM workspace.

import { NUMERICAL_FIGURES } from "./figures/numerical/figures.js?v=checkpoint-shell-15";

export const NUMERICAL_TUTORIAL_INTRO = `
  <p>
    These notes bridge from analytical mechanics to numerical approximation and
    the FEM workspace. The goal is not a full numerical methods course; it is the
    minimum concept path needed to understand why FEM approximates a field, why
    mesh and boundary conditions matter, and why the FEM result becomes the
    reference for later PINN comparison.
  </p>
  <p class="lesson-tip">
    Each section has one small figure. Use the controls to change one idea at a
    time, then connect the observation to the FEM workspace controls.
  </p>
`;

const CHAPTER_FIGURES = Object.fromEntries(
  Object.entries(NUMERICAL_FIGURES).map(([key, entry]) => [key, entry.config]),
);

const CHAPTER_FIGURE_FACTORIES = Object.fromEntries(
  Object.entries(NUMERICAL_FIGURES).map(([key, entry]) => [key, entry.factory]),
);

export const NUMERICAL_TUTORIAL_SECTIONS = [
  section("numerical-section-1", "1. Quick Mechanics Refresher", "mechanics", `
    <p>In solid mechanics, it is often easiest to start with stress. Stress tells us how much internal force is carried by a material at a point. In the simplest one-dimensional picture, average stress is force divided by area:</p>
    <p class="lesson-eq">$$\\sigma = \\frac{P}{A}$$</p>
    <p>If the same force is spread over a larger area, the stress is smaller.</p>
    <p>When stress acts on a body, the material deforms and points move. That movement is displacement. If neighboring points move by different amounts, the material stretches or shears. That local change is strain. In a simple axial picture, strain is displacement change over length:</p>
    <p class="lesson-eq">$$\\epsilon = \\frac{\\delta}{L}$$</p>
    <p>Here <code>delta</code> is the elongation and <code>L</code> is the original length.</p>
    <p>For a linear elastic material, stress and strain are proportional:</p>
    <p class="lesson-eq">$$\\sigma = E \\epsilon$$</p>
    <p>This is Hooke's law in its simplest form. Young's modulus <code>E</code> tells us how stiff the material is: a larger <code>E</code> means more stress is needed to produce the same strain.</p>
    <p>Putting these ideas together gives the basic bar formula for a member under axial load:</p>
    <p class="lesson-eq">$$\\delta = \\frac{PL}{AE}$$</p>
    <p>The figure below makes this concrete: adjust the point load, cross-section area, and Young's modulus. Observe how the stress, strain, and elongation would change. The drawing is a 2D side view of a 3D cuboid, so <code>A</code> means the cross-section area normal to the load. Try increasing the load first, then compare that change with increasing area or stiffness. The point is not to memorize one formula in isolation, but to see how force, geometry, and material properties work together in the simplest axial case.</p>
      <p>This formula is one of the first useful results in solid mechanics, but it depends on simplifying assumptions: the load acts axially, the bar is uniform, the cross-section stays constant, and the response stays in the linear-elastic small-deformation range. Under those assumptions, larger load gives more displacement, while a larger area or stiffer material gives less displacement. It is a simple but important reminder that stress, strain, material stiffness, and displacement are connected.</p>
      <p>Once we leave those assumptions behind, the response is no longer captured well by one closed-form bar equation. To handle non-axial loading, changing geometry, or material response that varies from point to point, we need a description that tracks how the field changes locally across the whole body. That is where calculus and differential equations enter the story.</p>
  `),
  section("numerical-section-2", "2. Analytical Formulas To Field Equations", "analytical", `
    <p>In chapter 1 we used <code>delta = PL/AE</code> because the geometry, loading, and support assumptions were simple enough for a closed-form estimate. Chapter 2 starts where that simplification ends.</p>
    <p>The frame is different. It has an opening, optional braces, a top load patch, a clamped bottom edge, and free boundaries. Moving the load patch changes the whole displacement and stress field, not only one scalar answer.</p>
    <p>For a static elastic solid, the local equilibrium idea can be written compactly as:</p>
    <p class="lesson-eq">$$\\nabla \\cdot \\sigma = 0$$</p>
    <p>A numerical method is needed because we still know the local physics, but the final field is too specific to write down by hand.</p>
    <p><strong>Workspace connection:</strong> geometry and top load patch controls exist because the physical problem is a field problem.</p>
  `),
  section("numerical-section-3", "3. Taylor Series And Local Approximation", "taylor", `
    <p>Taylor series gives a familiar way to think about approximation. Near an expansion point <code>x0</code>, a function can be approximated by local value, slope, and optionally curvature.</p>
    <p class="lesson-eq">$$f(x) \\approx f(x_0)+f'(x_0)(x-x_0)+\\frac{1}{2}f''(x_0)(x-x_0)^2$$</p>
    <p>The local approximation is usually good near <code>x0</code> and worse farther away. Ignoring higher terms creates truncation error.</p>
    <p>This is not FEM, but the mindset carries over: replace a hard continuous field with local approximations that can be computed.</p>
    <p><strong>Workspace connection:</strong> a finer mesh gives the displacement approximation more local places to change, with higher computational cost.</p>
  `),
  section("numerical-section-4", "4. ODE Initial Value Problems And Euler Method", "euler", `
    <p>An ODE gives a local rate of change. For example, <code>dy/dt = -ky</code> says the slope depends on the current value.</p>
    <p>Euler method turns that continuous rule into a repeated update:</p>
    <p class="lesson-eq">$$y_{n+1}=y_n+h f(t_n,y_n)$$</p>
    <p>The method is simple: use the current slope, move one step, and repeat. Smaller steps usually reduce error but require more computation.</p>
    <p>FEM is not Euler method. This chapter exists to show how a continuous mathematical statement can become a computable sequence.</p>
    <p><strong>Workspace connection:</strong> numerical settings trade accuracy and cost, just as step size does in a simple ODE solve.</p>
  `),
  section("numerical-section-5", "5. Finite Difference And PDE Residuals", "residual", `
    <p>Finite differences approximate spatial derivatives using nearby point values. For example:</p>
    <p class="lesson-eq">$$\\frac{du}{dx} \\approx \\frac{u(x+h)-u(x)}{h}$$</p>
    <p>A residual is what remains when an approximate solution is inserted into the governing equation.</p>
    <p class="lesson-eq">$$R = \\text{governing equation mismatch}$$</p>
    <p>This is the bridge concept: an approximate field becomes credible when its physics mismatch is controlled.</p>
    <p><strong>Workspace connection:</strong> FEM handles residual through a weak form, while PINNs later evaluate PDE residual at collocation points.</p>
  `),
  section("numerical-section-6", "6. Boundary Conditions", "boundary", `
    <p>A governing equation alone is not enough. Boundary conditions tell the solver how the outside world acts on the domain.</p>
    <p>A Dirichlet condition prescribes the unknown value, such as fixed displacement. A Neumann condition prescribes traction or flux:</p>
    <p class="lesson-eq">$$t=\\sigma n$$</p>
    <p>The current frame has a clamped bottom edge, a loaded top patch, and traction-free remaining boundaries.</p>
    <p><strong>Workspace connection:</strong> moving the top load patch changes the boundary condition, so the solved physical case changes.</p>
  `),
  section("numerical-section-7", "7. Mesh, Discretization, And Convergence", "mesh", `
    <p>A mesh divides the continuous domain into elements. That gives the computer a finite set of unknowns and a computable system.</p>
    <p>A coarse mesh is faster but may smooth over local behavior. A fine mesh can resolve corners, holes, braces, and load patches better, but it costs more.</p>
    <p>Convergence means a quantity of interest settles as the mesh is refined. In this structured geometry, some changes can be non-monotone because load facets and geometry representation change discretely.</p>
    <p><strong>Workspace connection:</strong> setting <code>Structured Cells per Side</code> to 80 gives the FEM baseline enough local detail for the teaching comparison.</p>
  `),
  section("numerical-section-8", "8. FEM Weak Form And Workspace Handoff", "weakForm", `
    <p>FEM approximates the unknown displacement field using shape functions. A simplified expression looks like:</p>
    <p class="lesson-eq">$$\\hat{u}(x)=a_1N_1(x)+a_2N_2(x)+a_3N_3(x)+\\cdots$$</p>
    <p>The shape functions are known. The coefficients or nodal values are unknown. Solving FEM means finding those values so the approximation balances the physics.</p>
    <p>FEM does not usually force the strong-form residual to be zero point by point. It handles residual through an integrated weak form, producing a system:</p>
    <p class="lesson-eq">$$K d = f$$</p>
    <p><strong>Workspace connection:</strong> geometry defines the domain, boundary controls define support and load, material controls define stress-strain behavior, mesh density defines the approximation space, and the solve returns displacement and stress fields.</p>
  `),
];

function section(id, title, figureKey, body) {
  return {
    id,
    title,
    figureFactory: CHAPTER_FIGURE_FACTORIES[figureKey],
    body,
  };
}

export function getNumericalFigureConfig(key) {
  return CHAPTER_FIGURES[key];
}
