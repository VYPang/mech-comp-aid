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
    <p>Figure 1 below makes this concrete: adjust the point load, cross-section area, and Young's modulus. Observe how the stress, strain, and elongation would change. The drawing is a 2D side view of a 3D cuboid, so <code>A</code> means the cross-section area normal to the load. Try increasing the load first, then compare that change with increasing area or stiffness. The point is not to memorize one formula in isolation, but to see how force, geometry, and material properties work together in the simplest axial case.</p>
    <p>There is also a local balance idea hiding inside this simple bar. To see it, imagine cutting out a very small slice of the member and asking the slice to stay in static equilibrium. If the stress at the left face is <code>σ</code>, then the stress at the right face is slightly different and can be written as <code>σ + (dσ/dx) dx</code>. For a constant cross-sectional area <code>A</code>, the forces on the two faces must balance, so the same idea can be written step by step in the equation panel:</p>
    <p class="lesson-eq">$$&#92;left(&#92;sigma + &#92;frac{d&#92;sigma}{dx} dx&#92;right)A - &#92;sigma A = 0$$</p>
    <p>The first line says the forces on the two faces must cancel. After removing the equal <code>σA</code> terms, the remaining balance is</p>
    <p class="lesson-eq">$$&#92;frac{d&#92;sigma}{dx} &#92;, dx &#92;, A = 0$$</p>
    <p>Because the slice has nonzero physical size, <code>dx · A</code> is not zero, so the stress change itself must be zero in the interior of the bar:</p>
    <p class="lesson-eq">$$&#92;frac{d&#92;sigma}{dx} = 0$$</p>
    <p>In other words, the axial stress does not change from point to point inside the bar when there is no distributed body force. That simple derivative statement is the bridge to the two-dimensional case in chapter 2, where we will write the same local-balance idea for a field that depends on both <code>x</code> and <code>y</code>.</p>
    <p>This formula is one of the first useful results in solid mechanics, but it depends on simplifying assumptions: the load acts axially, the bar is uniform, the cross-section stays constant, and the response stays in the linear-elastic small-deformation range. Under those assumptions, larger load gives more displacement, while a larger area or stiffer material gives less displacement. It is a simple but important reminder that stress, strain, material stiffness, and displacement are connected.</p>
    <p>Once we leave those assumptions behind, the response is no longer captured well by one closed-form bar equation. To handle non-axial loading, changing geometry, or material response that varies from point to point, we need a description that tracks how the field changes locally across the whole body. That is where calculus and differential equations enter the story.</p>
  `),
  section("numerical-section-2", "2. Analytical Formulas To Field Equations", "analytical", `
    <p>In chapter 1 we used <code>δ = PL/AE</code> because the geometry, loading, material, and support conditions were simple enough to collapse the whole problem into one scalar displacement. That is powerful, but it only works because every point in the bar follows the same one-dimensional story.</p>
      <figure class="lesson-static-panel" aria-label="Reinforced frame problem with top load patch, inner opening, X-brace reinforcement, and fixed bottom edge">
        <img src="./assets/numerical-x-brace-workspace.png?v=checkpoint-shell-21" alt="FEM workspace mesh preview showing the reinforced frame with an inner opening, X-brace reinforcement, top load patch, and fixed bottom support" />
        <figcaption>This is the reinforced frame problem used later in the FEM workspace. There is a fixed bottom edge with a top patch loaded with uniform traction. The X-brace reinforcement redirects the load path.</figcaption>
      </figure>
      <p>A more general loading case as shown in above figure does not behave like that. In this reinforced frame problem, the bottom edge is fixed, the top load is applied over a patch with reinforcement redirects the load path. Unlike the simplified case in last chapter, here two arbitrary points in the structure may move by different amounts and may carry different stress. The unknown is no longer just one number; it is a field, describing how a property is distributed across the whole domain that defines the interior of the structure. For example, displacement field <code>u(x, y)</code> and stress field <code>σ(x, y)</code> are commonly used in solid mechanics, where one can take it as a function of position and ask how the value changes from point to point.</p>
    <p>This equation is more general than the bar formula because it describes local balance point by point. But being more general also makes the problem harder. To solve it exactly by hand, the geometry, boundary conditions, and material behavior must be simple enough to produce a clean <strong>analytical</strong> expression. Once the shape has holes, mixed boundary conditions, moving load patches, or spatially varying stiffness, the exact solution is usually not something we can write down directly. That is where <strong>numerical</strong> methods enter to perform approximation. Instead of searching for one analytical closed-form expression for the whole field, we approximate the field with many simpler local pieces and check whether those pieces satisfy the governing physics well enough.</p>
    <p>Before moving on to next chapter, play with the field pattern and move the probe around the square. The color map shows the value of the stress field everywhere in the domain. For x-gradient and y-gradient case, the derivatives in both direction does not add up to zero, so the equilibrium is not satisfied. The balanced saddle case has a positive x-gradient and negative y-gradient that cancel out, so the equilibrium is satisfied. However, in practice, the stress field does not distribution as simple as the saddle case, but a more complicated pattern should also satisfy the same local balance idea. Note that the derivative is a local approximation built from nearby values, where the simplest approximation is to treat it as a straight linear slope between two points. We will introduce approximation in more details in chapter 3.</p>
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
