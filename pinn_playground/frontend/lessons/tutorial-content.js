// PINN tutorial content. Wording is lifted near-verbatim from
// pinn_playground/doc/pinn_tutorial_notes.md and lightly modified where the
// markdown referred to a "Figure Placeholder" so it now points at the
// matching interactive figure rendered below the section.
//
// Math is written in plain text + LaTeX-friendly markup; KaTeX rendering can
// be added in a later milestone if needed. For now we use Unicode (²₁₂…) and
// inline `code` for symbols, matching the existing style of the playground.

import { createQuadraticFigure } from "./figures/figure-1-quadratic-fit.js?v=checkpoint-shell-14";
import { createPolynomialFitFigure } from "./figures/figure-2-polynomial-fit.js?v=checkpoint-shell-14";
import { createGeneralizationFigure } from "./figures/figure-3-generalization.js?v=checkpoint-shell-14";
import { createMlpForwardFigure } from "./figures/figure-4-mlp-forward.js?v=checkpoint-shell-14";
import { createPinnLossFigure } from "./figures/figure-5-pinn-loss.js?v=checkpoint-shell-14";
import { createPinnFailureFigure } from "./figures/figure-6-failure-modes.js?v=checkpoint-shell-14";
import { createSurrogateFigure } from "./figures/figure-7-surrogate-loop.js?v=checkpoint-shell-14";

export const TUTORIAL_INTRO = `
  <p>
    These notes bridge the numerical-method mindset into deep learning, and then into
    Physics-Informed Neural Networks. The path is gradual: solve for parameters of a
    known function, fit a noisy curve, view machine learning as parameter search, view
    deep learning as a powerful but opaque model class, build PINNs from physics losses,
    discuss failure modes, and finally see why PINNs can be useful beyond replacing FEM.
  </p>
  <p class="lesson-tip">
    Each section pairs short reading with one interactive figure. Spend a moment with the
    figure before moving on — the controls are deliberately small so the underlying idea
    stays visible.
  </p>
`;

export const TUTORIAL_SECTIONS = [
  {
    id: "section-1",
    title: "1. Computing Parameters Of A Known Function",
    figureFactory: createQuadraticFigure,
    body: `
      <p>Before discussing machine learning, it is useful to begin with a familiar algebra problem.</p>
      <p>Suppose we believe that a relationship between input <code>x</code> and output <code>y</code> is exactly described by a quadratic function:</p>
      <p class="lesson-eq">y = a x² + b x + c</p>
      <p>The model form is already chosen. The only unknowns are the three parameters <code>a</code>, <code>b</code>, <code>c</code>. If we are given three points that lie exactly on the curve, each point gives one equation, and the resulting 3×3 linear system usually has a unique solution.</p>
      <p>The figure below makes this concrete: drag the three points and watch the matrix system rebuild and re-solve in real time. After solving, we have the complete function and can predict the output at a new input.</p>
      <p>This is the first important idea: <strong>a model is a function form with unknown parameters</strong>. In this quadratic example the model form is simple and the number of data points exactly matches the number of unknowns. The solution is clean because the data are assumed to be exact. Real engineering data are rarely this clean.</p>
    `,
  },
  {
    id: "section-2",
    title: "2. From Exact Solving To Modeling And Curve Fitting",
    figureFactory: createPolynomialFitFigure,
    body: `
      <p>The previous example was exact. Three points gave three equations, and the quadratic was forced to pass through every point.</p>
      <p>Now consider a more realistic case. Suppose five points are collected from an experiment. The true relationship is close to a third-degree polynomial, but every measurement contains noise.</p>
      <p>Because of noise, the points may not lie perfectly on any simple curve. If we force a curve to pass through all of them, we may fit the measurement errors rather than the real trend. This is where the idea of <strong>modeling</strong> becomes important: a model is a chosen mathematical representation, not the physical world itself.</p>
      <p>When data contain noise, we usually do not ask for a curve that passes through every point. Instead, we look for the curve that best fits the data according to an error measure such as the mean squared error:</p>
      <p class="lesson-eq">L = (1/N) Σ (ŷᵢ − yᵢ)²</p>
      <p>Finding a best-fit curve means finding the parameters that make this loss as small as possible.</p>
      <p>The figure below uses five noisy points sampled from a hidden cubic. Move the degree slider to see underfitting at low degree, a reasonable fit near the true degree, and visible oscillations once the polynomial has more than enough flexibility. This is the second important idea: <strong>model fitting is parameter selection by minimizing an error measure</strong>.</p>
    `,
  },
  {
    id: "section-3",
    title: "3. Machine Learning As Data-Driven Parameter Search",
    figureFactory: createGeneralizationFigure,
    body: `
      <p>Machine learning generalizes the curve-fitting idea. We still choose a model form, still have parameters, still compare predictions against known data, still use a loss function. The main difference is that the model may have many more parameters and the data may be too large or too complicated for a direct algebraic solution.</p>
      <p>The basic supervised workflow is: collect input-output data, choose a model family, define a loss function, adjust the parameters to reduce the loss, and use the trained model to predict outputs for new inputs.</p>
      <p>For example, a model learns a function:</p>
      <p class="lesson-eq">ŷ = f<sub>θ</sub>(x)</p>
      <p>where <code>θ</code> represents all trainable parameters. During training we compare the prediction against known data using a loss such as:</p>
      <p class="lesson-eq">L(θ) = (1/N) Σ (f<sub>θ</sub>(xᵢ) − yᵢ)²</p>
      <p>Training means changing <code>θ</code> until the loss becomes smaller. After training, we evaluate the function at an input that was not in the original dataset — that is the practical purpose of learning a function.</p>
      <p>This leads to three important concepts. <em>Underfitting</em> happens when the model is too simple to capture the real relationship. <em>Overfitting</em> happens when the model is flexible enough to memorize noise; training error becomes very low but prediction error at new inputs may be poor. <em>Model capacity</em> describes how flexible a model is.</p>
      <p>The figure below shows training points (yellow), hidden test points (grey), and a fitted polynomial. Drag the cursor to query a new <code>x</code>, and adjust the capacity slider. This is the third important idea: <strong>machine learning is not magic; it is parameter fitting for a selected model family, guided by a loss function and data</strong>.</p>
    `,
  },
  {
    id: "section-4",
    title: "4. Deep Learning As A More Powerful Function Model",
    figureFactory: createMlpForwardFigure,
    body: `
      <p>Deep learning follows the same basic pattern as curve fitting and machine learning, but the chosen model is now a neural network. In the PINN Playground the model is a multilayer perceptron, or MLP — a function made from layers of simple operations. Each layer takes numbers in, applies weights and biases, and passes the result through an activation function:</p>
      <p class="lesson-eq">z = W x + b, h = σ(z)</p>
      <p>After many layers the network becomes a flexible function:</p>
      <p class="lesson-eq">ŷ = f<sub>θ</sub>(x)</p>
      <p>Here <code>θ</code> now includes all weights and biases in all layers. A small network may have hundreds of parameters; a large one may have millions or billions.</p>
      <p>The loss function plays the same role as in curve fitting. The optimizer changes the network parameters to reduce it, usually by gradient-based optimization. An <em>epoch</em> means one optimization step over the current sampled training points. More epochs give the optimizer more chances to reduce the loss but do not guarantee a better answer.</p>
      <p>The architecture of an MLP controls its capacity. Two important settings are hidden width and number of hidden layers; both increase the parameter count. The figure below lets you scrub each one and see the parameter count and a forward pass through the network.</p>
      <p>Deep learning is powerful because it can learn complicated functions without the engineer writing the whole function by hand. This is also the danger: a smooth-looking output can still be physically wrong. This is the fourth important idea: <strong>deep learning gives us a powerful function approximator, but the result must still be checked against physics, data, and engineering judgment</strong>.</p>
    `,
  },
  {
    id: "section-5",
    title: "5. From Deep Learning To Physics-Informed Neural Networks",
    figureFactory: createPinnLossFigure,
    body: `
      <p>An ordinary supervised neural network learns from data pairs <code>(xᵢ, yᵢ)</code>. A Physics-Informed Neural Network uses a different idea: the network is trained to satisfy physical laws, not only to match labels.</p>
      <p>The model still predicts a function. In the PINN Playground the network maps position to displacement:</p>
      <p class="lesson-eq">(x, y) ↦ (u(x, y), v(x, y))</p>
      <p>Because the network is differentiable, we can take its derivatives and check whether physics is satisfied.</p>
      <p>Many physical systems are described by differential equations. The equation can often be rearranged into a residual form:</p>
      <p class="lesson-eq">R(x) = 0</p>
      <p>If a neural network predicts a field, we substitute that prediction into the equation; if the prediction satisfies the physics, the residual should be close to zero. The PDE loss then becomes:</p>
      <p class="lesson-eq">L<sub>PDE</sub> = (1/N) Σ |R(xᵢ)|²</p>
      <p>The points <code>xᵢ</code> are called collocation points.</p>
      <p>For 2D solid mechanics, the network predicts displacement; we then differentiate to get strain, apply the material law to get stress, and require equilibrium in the interior:</p>
      <p class="lesson-eq">∇·σ = 0</p>
      <p>Boundary conditions become additional terms in the loss: the bottom is fixed, the top load patch receives traction, the free boundaries should have near-zero traction.</p>
      <p>So the total PINN loss is built from several pieces:</p>
      <p class="lesson-eq">L = w<sub>PDE</sub> L<sub>PDE</sub> + w<sub>BC</sub> L<sub>BC</sub> + w<sub>data</sub> L<sub>data</sub></p>
      <p>The data term may be absent. In a pure PINN the model trains only from physics residuals and boundary conditions; in a teacher-guided PINN, sparse data from a numerical solution can be added.</p>
      <p>The figure below shows the three categories of points in a 2D domain. Toggle each loss term and adjust the weights to see how the dominant signal changes. This is the fifth important idea: <strong>a PINN trains a neural network not only to fit data, but also to satisfy differential equations and boundary conditions</strong>.</p>
    `,
  },
  {
    id: "section-6",
    title: "6. PINN Failure Modes And Practical Mitigation Tricks",
    figureFactory: createPinnFailureFigure,
    body: `
      <p>PINNs are attractive because they combine neural networks with physical laws, but they are not automatically reliable. Many PINN failures happen because the optimization problem is difficult, not because the physical equations are wrong.</p>
      <p><strong>Input normalization</strong> maps coordinates into a numerically convenient range, often around:</p>
      <p class="lesson-eq">x̂, ŷ ∈ [−1, 1]</p>
      <p>Networks are sensitive to scale, and even when coordinates are already small, normalization can make activation behavior more stable. In the playground, input normalization helps the MLP use its capacity more effectively across the domain.</p>
      <p><strong>Loss balancing</strong> matters because if one term is much larger than the others, the optimizer may mostly reduce that term and ignore the rest. The model may reduce interior equilibrium residual while still violating a boundary condition. Loss weights are not just numerical decorations; they define what the optimizer pays attention to.</p>
      <p><strong>Pure physics training</strong> can be hard. The model must discover a field that satisfies the PDE, the boundary conditions, the geometry, and any material assumptions, with feedback that comes only from residuals and boundary losses. If those losses are indirect, sparse, or poorly scaled, training may converge to a field that reduces the loss but still misses important physical behavior.</p>
      <p><strong>Dirichlet versus Neumann boundary conditions.</strong> Dirichlet conditions specify the value of the solution directly — direct supervision on the network output. Neumann conditions specify a derivative-related quantity such as traction; the model predicts displacement, but the load condition is imposed through stress, which depends on displacement gradients:</p>
      <p class="lesson-eq">t = σ n</p>
      <p>That makes the learning signal more indirect, which is one reason a plain PINN may learn a plausible-looking displacement field while still under-predicting stress magnitude.</p>
      <p><strong>A small amount of data can help.</strong> Adding a few reliable data points acts as anchors; in the playground, teacher-guided training adds sparse FEM displacement samples on the load patch, exactly where the original boundary condition is indirect.</p>
      <p>The figure below compares a toy "predicted" field against a fixed reference. Toggle normalization, swap the boundary type, and add teacher points one at a time to see each effect. This is the sixth important idea: <strong>PINN quality depends strongly on training design, scaling, sampling, boundary-condition type, and the amount of trustworthy guidance available</strong>.</p>
    `,
  },
  {
    id: "section-7",
    title: "7. PINNs Beyond Replacing FEM",
    figureFactory: createSurrogateFigure,
    body: `
      <p>It is tempting to describe PINNs as an alternative to traditional numerical methods. Sometimes that is useful, but it is not the whole story. For many engineering problems FEM is still more mature, more reliable, and easier to verify. A PINN should not be trusted simply because it uses a neural network or because its loss curve decreases.</p>
      <p>The deeper advantage of PINNs and related neural surrogates is that they can become fast, differentiable approximations of a physical system after training. A surrogate model is a cheaper approximation of a more expensive computation, valuable when the same physical system must be queried many times — design optimization, parameter studies, uncertainty quantification, inverse problems, real-time control, rapid what-if exploration.</p>
      <p>Because neural networks are differentiable, they can participate naturally in gradient-based optimization. A trained model provides not only a prediction but also derivatives of that prediction with respect to inputs or design variables:</p>
      <p class="lesson-eq">dσ̂ / dd</p>
      <p>That makes PINN-style models attractive for workflows where the goal is not only to solve one case, but to search through a design space.</p>
      <p>The black-box nature of deep learning is a real disadvantage in engineering. One way to reduce that disadvantage is to avoid asking the neural network to learn everything. Domain knowledge should still do as much work as possible: nondimensionalize variables, normalize inputs, encode known geometry features, separate boundary regions by physical meaning, use numerical solutions as reference anchors, transform outputs so simple boundary conditions are automatically satisfied. After prediction, compute stress from displacement using known constitutive laws, check equilibrium residuals, compare against FEM at selected validation cases, enforce engineering constraints, and report uncertainty when the model leaves its trusted regime.</p>
      <p>The figure below sketches a design loop. Drag the design variable to see the surrogate respond instantly; click to schedule an FEM verification when you suspect the surrogate is outside its trusted range. This is the seventh important idea: <strong>PINNs are most valuable when combined with existing physics knowledge, numerical methods, and engineering checks, not when used as a blind replacement for them</strong>.</p>
    `,
  },
  {
    id: "summary",
    title: "Closing Summary",
    figureFactory: null,
    body: `
      <p>The conceptual path from numerical methods to PINNs can be summarized as follows.</p>
      <ol class="lesson-figure-bullets">
        <li>A known function form can be determined by solving for parameters. Three exact points pin one quadratic.</li>
        <li>Real data are noisy, so modeling becomes a best-fit problem rather than an exact interpolation problem.</li>
        <li>Machine learning generalizes this idea: choose a model, define a loss, train parameters, predict unseen values.</li>
        <li>Deep learning chooses a very powerful model family. More capacity, but black-box behavior and harder training.</li>
        <li>PINNs add physics to the training objective. The model also tries to satisfy PDE residuals and boundary conditions.</li>
        <li>PINNs can fail when the physics loss is hard to optimize, the boundary conditions are indirect, the sampling is poor, or the model lacks useful anchors.</li>
        <li>PINNs are most useful as part of a larger workflow — fast, differentiable, physics-aware surrogates that work with numerical methods, domain knowledge, and validation checks.</li>
      </ol>
      <p class="lesson-tip"><strong>A PINN is still a model. It can be powerful, but it must be trained, checked, and interpreted with physics-aware engineering judgment.</strong></p>
      <p>When you are ready, mark the checkpoint complete to unlock <em>Preview Collocation Points</em>, where you start configuring the actual PINN run on the same geometry as the FEM baseline.</p>
    `,
  },
];
