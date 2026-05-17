// PINN tutorial content. Wording is lifted near-verbatim from
// pinn_playground/doc/pinn_tutorial_notes.md and lightly modified where the
// markdown referred to a "Figure Placeholder" so it now points at the
// matching interactive figure rendered below the section.
//
// Tutorial equations are written with LaTeX delimiters so the tutorial cell
// can render them with KaTeX in the browser.

import { createQuadraticFigure } from "./figures/figure-1-quadratic-fit.js?v=checkpoint-shell-15";
import { createPolynomialFitFigure } from "./figures/figure-2-polynomial-fit.js?v=checkpoint-shell-15";
import { createGeneralizationFigure } from "./figures/figure-3-generalization.js?v=checkpoint-shell-15";
import { createMlpForwardFigure } from "./figures/figure-4-mlp-forward.js?v=checkpoint-shell-15";
import { createPinnLossFigure } from "./figures/figure-5-pinn-loss.js?v=checkpoint-shell-15";
import { createPinnFailureFigure } from "./figures/figure-6-failure-modes.js?v=checkpoint-shell-15";
import { createSurrogateFigure } from "./figures/figure-7-surrogate-loop.js?v=checkpoint-shell-15";

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
    body: String.raw`
      <p>Before discussing machine learning, it is useful to begin with a familiar algebra problem.</p>
      <p>Given that input <code>x</code> and output <code>y</code> is described by a quadratic function:</p>
      <p class="lesson-eq">$$y = ax^2 + bx + c$$</p>
      <p>In this example, the quadratic is the chosen <strong>model</strong>: a mathematical representation of the relationship between input <code>x</code> and output <code>y</code>. The coefficients <code>a</code>, <code>b</code>, and <code>c</code> are the model parameters that must be determined. Since there are three unknown parameters, we need three equations to solve for them. Each point <code>(xᵢ, yᵢ)</code> gives one equation. This produces a 3×3 linear system with a unique solution if the points provide independent equations.</p>
      <p>The figure below makes this concrete: drag the three points and watch the matrix system rebuild and re-solve in real time. After solving, we have the complete function and can predict the output at a new input.</p>
      <p>This is the first important idea: in engineering, we choose a model to describe the trend of sampled data or the response of a system. A quadratic is only one simple model family; depending on the application, engineers may also use exponential, logarithmic, or many other model forms. In this exact example the number of data points exactly matches the number of unknown parameters, so the solution is clean. Real engineering data are rarely this clean, which leads naturally to modeling and curve fitting.</p>
    `,
  },
  {
    id: "section-2",
    title: "2. From Exact Solving To Modeling And Curve Fitting",
    figureFactory: createPolynomialFitFigure,
    body: String.raw`
      <p>Chapter 1 used exact points, so solving for the parameters was clean. Engineering sampling is usually different. Data may come from strain gauges, displacement sensors, pressure measurements, temperature logs, or numerical sampling, and those samples often contain noise from sensors, material variability, imperfect loading, discretization error, or limited measurement resolution.</p>
      <p>That changes the objective. We are no longer trying to force one curve through every sampled point. Instead, we want a model that captures the underlying trend of the data. This is different from Chapter 1 in practice, but it is fundamentally the same kind of problem: we still choose a model family and compute the parameter values that best describe the observed data.</p>
      <p>In this section the model family is still polynomial, but now we can vary its degree. A low-degree polynomial may be too rigid to capture turns or extrema in the sample set. That is <strong>underfitting</strong>. A very high-degree polynomial may bend enough to pass close to every noisy point, but then it starts picking up random sampling noise instead of the real trend. That is <strong>overfitting</strong>. These two ideas are counterintuitive at first. A model can be bad because it is too simple, but it can also be bad because it is too flexible. In engineering practice, the goal is usually to visualize the data trend, try several plausible model choices, and then judge which model generalizes best rather than which one hugs the current sample most aggressively.</p>
      <div class="lesson-static-figure-row" aria-label="Fixed visual comparison of underfitting and overfitting">
        <figure class="lesson-static-panel">
          <svg viewBox="0 0 320 220" role="img" aria-labelledby="underfit-title underfit-desc">
            <title id="underfit-title">Underfit polynomial model</title>
            <desc id="underfit-desc">Noisy sample points scatter around a true curved trend, while a straight fitted line misses the main bends.</desc>
            <rect x="0" y="0" width="320" height="220" rx="8" class="lesson-static-bg" />
            <path d="M36 178 H296 M36 178 V28" class="lesson-static-axis" />
            <path d="M36 146 C72 166 101 168 132 134 C164 97 187 42 222 52 C254 62 275 105 296 78" class="lesson-static-truth" />
            <path d="M42 154 L296 82" class="lesson-static-fit lesson-static-fit-under" />
            <g class="lesson-static-points">
              <circle cx="50" cy="141" r="4" />
              <circle cx="84" cy="175" r="4" />
              <circle cx="120" cy="139" r="4" />
              <circle cx="154" cy="116" r="4" />
              <circle cx="190" cy="48" r="4" />
              <circle cx="224" cy="68" r="4" />
              <circle cx="260" cy="82" r="4" />
              <circle cx="289" cy="94" r="4" />
            </g>
            <g class="lesson-static-legend">
              <path d="M52 28 H76" class="lesson-static-truth" />
              <text x="82" y="32">true trend</text>
              <path d="M178 28 H202" class="lesson-static-fit lesson-static-fit-under" />
              <text x="208" y="32">fit</text>
            </g>
          </svg>
          <figcaption><strong>Underfit:</strong> the model is too rigid, so it misses the main curvature even though the samples show a bend.</figcaption>
        </figure>
        <figure class="lesson-static-panel">
          <svg viewBox="0 0 320 220" role="img" aria-labelledby="overfit-title overfit-desc">
            <title id="overfit-title">Overfit polynomial model</title>
            <desc id="overfit-desc">Noisy sample points scatter around a true curved trend, while a highly flexible fitted curve wiggles to follow the noise.</desc>
            <rect x="0" y="0" width="320" height="220" rx="8" class="lesson-static-bg" />
            <path d="M36 178 H296 M36 178 V28" class="lesson-static-axis" />
            <path d="M36 146 C72 166 101 168 132 134 C164 97 187 42 222 52 C254 62 275 105 296 78" class="lesson-static-truth" />
            <path d="M50 141 C62 121 73 190 84 175 C99 154 106 122 120 139 C138 158 137 110 154 116 C169 122 174 34 190 48 C205 62 207 88 224 68 C239 48 248 112 260 82 C273 54 282 116 289 94" class="lesson-static-fit lesson-static-fit-over" />
            <g class="lesson-static-points">
              <circle cx="50" cy="141" r="4" />
              <circle cx="84" cy="175" r="4" />
              <circle cx="120" cy="139" r="4" />
              <circle cx="154" cy="116" r="4" />
              <circle cx="190" cy="48" r="4" />
              <circle cx="224" cy="68" r="4" />
              <circle cx="260" cy="82" r="4" />
              <circle cx="289" cy="94" r="4" />
            </g>
            <g class="lesson-static-legend">
              <path d="M52 28 H76" class="lesson-static-truth" />
              <text x="82" y="32">true trend</text>
              <path d="M178 28 H202" class="lesson-static-fit lesson-static-fit-over" />
              <text x="208" y="32">fit</text>
            </g>
          </svg>
          <figcaption><strong>Overfit:</strong> the model is flexible enough to chase noisy samples, so it can move away from the true trend between points.</figcaption>
        </figure>
      </div>
      <p>That is why engineers use a <strong>testing set</strong> or other held-out data. The training data are used to compute the model parameters. The testing data are not used in that computation; they are kept separate so we can check whether the fitted model also performs well on unseen samples. In the figure below you can compare against the hidden ground-truth curve directly. In later machine-learning settings, this same idea appears as explicit training and testing data.</p>
      <p>Once we choose a model family, parameter computation becomes an optimization problem. We search for the coefficients that minimize the mean squared error (MSE) over the sampled points:</p>
      <p class="lesson-eq">$$L = \frac{1}{N} \sum_{i=1}^{N} (\hat{y}_i - y_i)^2$$</p>
      <p>For each sampled input $x_i$, the model produces a prediction $\hat{y}_i$. We compare that prediction with the measured value $y_i$, square the error, and average over all samples. The best-fit parameters are the ones that make this average error minimized.</p>
      <p>Use the figure to test these ideas. Increase the polynomial degree and watch when the model begins to capture bends that a simpler curve misses. Then push the degree too high and see how the curve starts chasing noisy points. Next increase the sample count and observe that with more data, a somewhat more flexible model can sometimes be supported more reliably because the overall trend is revealed more clearly.</p>
      <p>The main lesson is not that there is one golden rule for choosing degree. There is not. Real datasets contain randomness, so model selection is partly an engineering judgment informed by plots, testing performance, and domain knowledge. Understanding underfitting, overfitting, and held-out evaluation is more important than memorizing one specific fitting formula. This is the second important idea: <strong>model fitting is parameter selection under uncertainty, guided by error measures and checked on data that were not used for fitting</strong>. In the next chapter, this same logic becomes the machine-learning workflow.</p>
    `,
  },
  {
    id: "section-3",
    title: "3. Machine Learning As Data-Driven Parameter Search",
    figureFactory: createGeneralizationFigure,
    body: String.raw`
      <p>Curve fitting already belongs to the broad idea of <strong>machine learning</strong>. Chapter 2 used a simple polynomial model, but the logic was already the same.</p>
      <p>The next step is to name the full workflow more clearly. In supervised machine learning, using data to compute the model parameters is called <strong>training</strong>. The trained model is then used to make a prediction at a new input. That prediction stage is called <strong>inference</strong>.</p>
      <p>A machine learning model can be written as:</p>
      <p class="lesson-eq">$$\hat{y} = f_{\theta}(x)$$</p>
      <p>Here <code>θ</code> represents the learned parameters. Training adjusts <code>θ</code> using data. Inference means evaluating the learned function at a new <code>x</code> to obtain a predicted output $\hat{y}$.</p>
      <p>In this polynomial example, <strong>model complexity</strong> is directly related to the degree we choose. A higher-degree polynomial can bend more and capture a more complicated trend. But if the real trend is fairly simple, or if the dataset is too small, that extra flexibility can easily start matching random noise and become <strong>overfitted</strong>. A lower-degree polynomial is more rigid, so it may miss important curvature and become <strong>underfitted</strong>. So the goal is not to maximize complexity, but to find a <strong>reasonable fit</strong> that captures the main trend without chasing noise. This leads to <strong>generalization</strong>: a good model should behave well not only on the training points, but also on new unseen data.</p>
      <p>The figure below makes that idea visible. Yellow points are training data, grey points are hidden test data, and the dashed curve shows the true relationship. Adjust the capacity slider, then drag the cursor to a new <code>x</code>. Watch how the model prediction changes, and compare it with the true value at that same location. This is machine-learning inference in its simplest form.</p>
      <p>This is the third important idea: <strong>machine learning trains a parameterized model from data so it can make useful predictions on unseen inputs, and its quality is judged by generalization rather than training fit alone</strong>. The next chapter keeps this same logic but replaces the polynomial with a much more powerful model family.</p>
    `,
  },
  {
    id: "section-4",
    title: "4. Deep Learning As A More Powerful Function Model",
    figureFactory: createMlpForwardFigure,
    body: String.raw`
      <p>Deep learning follows the same basic pattern as curve fitting and machine learning, but the chosen model is now a neural network. In the PINN Playground the model is a multilayer perceptron, or MLP — a function made from layers of simple operations. An MLP is powerful when the mapping in the data is too complicated or unintuitive to describe well with a simple model, and when we have enough data to constrain that flexibility. In engineering, one example is learning a surrogate that maps design or loading parameters to a structural response when the relationship is too complicated to write down directly. Each layer takes numbers in, applies weights and biases, and passes the result through an activation function:</p>
      <p class="lesson-eq">$$\begin{aligned} z &= Wx + b \\ h &= \sigma(z) \end{aligned}$$</p>
      <p>After many layers the network becomes a flexible function:</p>
      <p class="lesson-eq">$$\hat{y} = f_{\theta}(x)$$</p>
      <p>Here <code>θ</code> now includes all weights and biases in all layers. A small network may have hundreds of parameters; a large one may have millions or billions.</p>
      <p>The loss function still plays the same role as in the polynomial examples from the previous chapters: it measures how far the model prediction is from the target data. The difference is that an MLP is much more complex. With a polynomial model, parameter fitting can often be written as a relatively direct algebraic or least-squares problem. For an MLP, the many layers and nonlinear activations make that kind of analytic solution impractical, so we instead use an <strong>optimizer</strong> to gradually adjust the weights and biases and reduce the loss. In practice this is usually done with gradient-based methods such as SGD and related variants, but this tutorial stays at a high level. The main idea is simply that training becomes an iterative search for better parameters. An <strong>epoch</strong> means one optimization pass over the current sampled training points. More epochs give the optimizer more chances to reduce the loss but do not guarantee a better answer.</p>
      <p>The architecture of an MLP controls its capacity. Two important settings are hidden width and number of hidden layers; both increase the parameter count. The figure below lets you scrub each one and see the parameter count and a forward pass through the network.</p>
      <p> In summary, Deep learning is powerful because it can learn complicated functions without the engineer writing the whole function by hand, but the result must still be checked against physics, data, and engineering judgment to determine its validity.</p>
    `,
  },
  {
    id: "section-5",
    title: "5. From Deep Learning To Physics-Informed Neural Networks",
    figureFactory: createPinnLossFigure,
    body: String.raw`
      <p>In Chapter 4, a neural network was trained from data by comparing predictions with known targets. A PINN keeps that same idea. If data are available, we can still use a data loss such as mean squared error:</p>
      <p class="lesson-eq">$$L_{\mathrm{data}} = \frac{1}{N} \sum_{i=1}^{N} \lVert f_{\theta}(x_i) - y_i \rVert^2$$</p>
      <p>The new idea is that we add another term to the loss, not from labels, but from the governing physics equations. This additional term penalizes outputs that violate the physics, so the model can learn a useful solution even when data are sparse or not abundant.</p>
      <p>In the PINN Playground, the model maps position to displacement:</p>
      <p class="lesson-eq">$$(x, y) \mapsto (u(x, y), v(x, y))$$</p>
      <p>That means the network predicts how much each coordinate moves under loading. From the predicted displacement field, we can compute strain, then stress, and from stress we can compute derived quantities such as the von Mises stress field:</p>
      <p class="lesson-eq">$$\varepsilon = \frac{1}{2}\left(\nabla u + \nabla u^{T}\right), \qquad \sigma = C : \varepsilon$$</p>
      <p class="lesson-eq">$$\sigma_{\mathrm{vm}} = \sqrt{\sigma_{xx}^{2} - \sigma_{xx}\sigma_{yy} + \sigma_{yy}^{2} + 3\tau_{xy}^{2}}$$</p>
      <p>Inside the solid, the prediction must also satisfy the governing physics. For this problem, the equilibrium equation is:</p>
      <p class="lesson-eq">$$\nabla \cdot \sigma = 0$$</p>
      <p>We rearrange that into a residual form by moving everything to one side:</p>
      <p class="lesson-eq">$$R_{\mathrm{eq}}(x, y) = \nabla \cdot \sigma(x, y)$$</p>
      <p>If the model is physically correct, this residual should be close to zero. So at interior collocation points we add a PDE loss term such as:</p>
      <p class="lesson-eq">$$L_{\mathrm{PDE}} = \frac{1}{N} \sum_{i=1}^{N} \lvert R_{\mathrm{eq}}(x_i, y_i) \rvert^2$$</p>
      <p>Boundary coordinates also contribute to the loss. Fixed boundaries should satisfy displacement constraints such as <code>u = 0</code> and <code>v = 0</code>. The load patch should satisfy the applied traction condition, and free boundaries should satisfy near-zero traction. These requirements are collected into a boundary-condition loss term $L_{\mathrm{BC}}$.</p>
      <p>So the total PINN loss is built from physics, boundary conditions, and optionally data:</p>
      <p class="lesson-eq">$$L = w_{\mathrm{PDE}} L_{\mathrm{PDE}} + w_{\mathrm{BC}} L_{\mathrm{BC}} + w_{\mathrm{data}} L_{\mathrm{data}}$$</p>
      <p>The figure below focuses on the geometry behind these physics terms. Interior collocation points contribute to the PDE residual, while boundary points contribute to fixed, loaded, or free-boundary checks. This is the fifth important idea: <strong>a PINN extends ordinary neural-network training by adding physics-based and boundary-condition losses, so the model is guided not only by data but also by the governing equations of the system</strong>.</p>
    `,
  },
  {
    id: "section-6",
    title: "6. PINN Failure Modes And Advanced Training Tricks",
    figureFactory: createPinnFailureFigure,
    body: String.raw`
      <p>PINNs can fail even when the governing equations are correct. The main difficulty is often the training formulation. A pure PINN trained only from PDE residual and boundary-condition loss has no dense target data telling it what the solution should look like, so the optimizer must discover the field only from indirect physics signals.</p>
      <p>For the current problem, that difficulty is strongest on the loaded top patch. The network predicts displacement, so a <strong>Dirichlet</strong> boundary condition is relatively direct because it tells the model what output value to produce. A <strong>Neumann</strong> boundary condition is harder because it constrains traction through stress, and stress depends on displacement gradients:</p>
      <p class="lesson-eq">$$t = \sigma n$$</p>
      <p>So a plain traction-driven PINN can learn a displacement field that looks broadly reasonable while still under-predicting the stress magnitude near the load patch. This is not because the PDE is wrong. It is because the most important supervision arrives through derivatives rather than through direct displacement targets.</p>
      <p>This is where <strong>teacher points</strong> help. A teacher point is just a sparse sampled data point with a trusted displacement value, usually taken from FEM. Conceptually, this is the same idea as the sampled points in Chapter 2 and the training data in Chapters 3 and 4: known input-output pairs guide the model. The difference is that in a PINN we use only a small number of these points, while still keeping the PDE and boundary losses active.</p>
      <p>In this playground, load-patch teacher points are especially useful because they add direct displacement guidance exactly where the original loading information was indirect. They do not replace physics; they act as local anchors that make the optimization problem easier to solve.</p>
      <h4 class="lesson-section-subtitle">Advanced Training Tricks</h4>
      <p>Several training tricks can further improve convergence. <strong>Input normalization</strong> rescales coordinates into a numerically convenient range such as $[-1, 1]$, which helps the MLP use its capacity more effectively. <strong>Adaptive collocation sampling</strong> places or refreshes more domain points where the residual is still large, so training spends more effort where the model is currently wrong. <strong>Fourier-feature encoding</strong>, introduced together with the resampling improvements in this playground, gives the network richer high-frequency input representations so sharp local behavior is easier to express.</p>
      <p>The figure below focuses on the first part of this story: why a Neumann traction condition gives the network a more indirect training signal than a Dirichlet displacement condition. This is the sixth important idea: <strong>PINN quality depends strongly on how the training problem is posed, where supervision is applied, and which numerical tricks are used to help the optimizer learn difficult physics</strong>.</p>
    `,
  },
  {
    id: "section-7",
    title: "7. PINNs Beyond Replacing FEM",
    figureFactory: createSurrogateFigure,
    body: String.raw`
      <p>Chapter 6 showed an important limitation: a PINN is not automatically easy to train, and a pure physics-driven formulation can struggle when the supervision signal is indirect. That immediately raises the right engineering question: if FEM already gives a trusted answer for one load case, why use a PINN at all?</p>
      <p>The answer is usually <strong>not</strong> that a PINN should blindly replace FEM. For many engineering problems FEM is still more mature, more reliable, and easier to verify. The stronger use case is different: after training, a PINN or related neural surrogate can become a fast approximation of the same physical system, so we can evaluate many similar cases much more cheaply.</p>
      <p>A <strong>surrogate model</strong> is a cheaper approximation of a more expensive computation. In this setting, FEM remains the high-trust reference, while the trained neural model becomes the fast evaluator inside a larger workflow. That is useful when the same system must be queried many times: design optimization, parameter studies, uncertainty quantification, inverse problems, real-time control, or rapid what-if exploration.</p>
      <p>Because neural networks are differentiable, they can also participate naturally in gradient-based design loops. A trained model provides not only a prediction but also derivatives of that prediction with respect to inputs or design variables:</p>
      <p class="lesson-eq">$$\frac{\mathrm{d}\hat{\sigma}}{\mathrm{d}d}$$</p>
      <p>So the real goal is not only to solve one case, but to search through a design space quickly while still keeping physics and verification in the loop. The black-box weakness of deep learning does not disappear, so good engineering practice is to make the network do only the part that actually benefits from learning. Domain knowledge should still carry as much of the burden as possible: normalize inputs, encode geometry meaning, separate boundary regions, use FEM solutions or teacher points as anchors when needed, and compute stress from displacement with known constitutive laws rather than asking the network to invent that structure for itself.</p>
      <p>The figure below shows this hybrid idea. The surrogate gives an instant prediction as the design variable changes, but FEM still appears as the reference check when the design moves outside the surrogate's trusted region. This is the seventh important idea: <strong>PINNs are most valuable when combined with existing physics knowledge, numerical methods, and engineering checks, not when used as a blind replacement for them</strong>.</p>
    `,
  },
  {
    id: "summary",
    title: "Closing Summary",
    figureFactory: null,
    body: `
      <p>This tutorial moved step by step from exact curve fitting, to noisy data fitting, to machine learning, to deep learning, and finally to physics-informed neural networks. The central idea is that a PINN is still a trainable model: it predicts outputs from inputs, learns through a loss function, and succeeds or fails depending on how clearly the training problem is posed.</p>
      <p>What changes in a PINN is that physics and boundary conditions become part of that loss. That makes the model more physically informed, but it also makes training more delicate, especially when the supervision signal is indirect, as in Neumann loading. In practice, PINNs are often most useful not as blind replacements for FEM, but as fast, differentiable surrogates that work together with numerical solvers, domain knowledge, and careful validation.</p>
      <p class="lesson-tip"><strong>A PINN is still a model. It can be powerful, but it must be trained, checked, and interpreted with physics-aware engineering judgment.</strong></p>
      <p>When you are ready, mark the checkpoint complete to unlock <em>Preview Collocation Points</em>, where you start configuring the actual PINN run on the same geometry as the FEM baseline.</p>
    `,
  },
];
