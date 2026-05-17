# PINN Tutorial Notes - From Numerical Methods To Physics-Informed Deep Learning

## Purpose

These notes are intended to become the written tutorial content for the PINN session of the WebUI. The goal is to bridge from the numerical-method mindset into the deep-learning mindset, and then into Physics-Informed Neural Networks.

The intended student has already seen that a numerical method such as FEM can produce a trusted reference solution when the geometry, material, load, and boundary conditions are clearly defined. The next question is different:

How can a machine learning model learn a useful function, and how can physics guide that learning?

The path in this note is deliberately gradual:

1. solve for parameters of a simple known function,
2. fit a model to noisy data,
3. understand machine learning as parameter search,
4. understand deep learning as a powerful but less transparent model class,
5. introduce PINNs as deep learning models trained with physics losses,
6. discuss common PINN failure modes and mitigation strategies,
7. explain why PINNs can be useful beyond replacing a numerical solver.

## 1. Computing Parameters Of A Known Function

Before discussing machine learning, it is useful to begin with a familiar algebra problem.

Suppose we believe that a relationship between input `x` and output `y` is exactly described by a quadratic function:

$$
y = ax^2 + bx + c
$$

In this example, the quadratic is the chosen model: a mathematical representation of the relationship between input `x` and output `y`. The only unknowns are the three model parameters:

$$
a, \quad b, \quad c.
$$

If we are given three points that lie exactly on the curve,

$$
(x_1, y_1), \quad (x_2, y_2), \quad (x_3, y_3),
$$

then each point gives one equation:

$$
y_1 = ax_1^2 + bx_1 + c
$$

$$
y_2 = ax_2^2 + bx_2 + c
$$

$$
y_3 = ax_3^2 + bx_3 + c.
$$

This is a system of three equations with three unknowns. In matrix form:

$$
\begin{bmatrix}
x_1^2 & x_1 & 1 \\
x_2^2 & x_2 & 1 \\
x_3^2 & x_3 & 1
\end{bmatrix}
\begin{bmatrix}
a \\
b \\
c
\end{bmatrix}
=
\begin{bmatrix}
y_1 \\
y_2 \\
y_3
\end{bmatrix}.
$$

If the three points have distinct `x` values, this system usually has one unique solution. After solving the system, we have the complete function. We can then predict the output at a new input, such as `x = 0.7`, by substituting it into the fitted quadratic.

This is the first important idea: in engineering, we choose a model to describe the trend of sampled data or the response of a system. A quadratic is only one simple model family; depending on the application, engineers may also use exponential, logarithmic, or many other model forms.

In this exact example, the number of data points exactly matches the number of unknown parameters, so the solution is clean. Real engineering data are rarely this clean, which leads naturally to modeling and curve fitting.

### Interactive Figure Placeholder 1 - Exact Quadratic Parameter Recovery

**Figure goal:** Show that three exact points determine one quadratic curve.

**Visual layout:**

- A 2D coordinate plot with three draggable points.
- A quadratic curve passing through all three points.
- A side panel showing the current fitted equation `y = ax^2 + bx + c`.
- A small matrix equation that updates as the points move.

**Interactions:**

- Students drag any of the three points.
- The curve updates immediately.
- The values of `a`, `b`, and `c` update immediately.
- A warning appears if two points share almost the same `x` value, because the system becomes ill-conditioned or unsolvable.

**Teaching focus:**

- The selected function form controls what kind of relationship can be represented.
- The parameters define the specific curve inside that function family.
- When the model form is correct and the data are exact, parameter recovery can be direct.

## 2. From Exact Parameter Solving To Modeling And Curve Fitting

The previous example was exact. Three points gave three equations, and the quadratic was forced to pass through every point.

Engineering sampling is usually different. Data may come from strain gauges, displacement sensors, pressure measurements, temperature logs, or numerical sampling, and those samples often contain noise from sensors, material variability, imperfect loading, discretization error, or limited measurement resolution.

That changes the objective. We are no longer trying to force one curve through every sampled point. Instead, we want a model that captures the underlying trend of the data. This is different from Chapter 1 in practice, but it is fundamentally the same kind of problem: we still choose a model family and compute the parameter values that best describe the observed data.

In this section the model family is still polynomial, but now we can vary its degree. A low-degree polynomial may be too rigid to capture turns or extrema in the sample set. That is **underfitting**. A very high-degree polynomial may bend enough to pass close to every noisy point, but then it starts picking up random sampling noise instead of the real trend. That is **overfitting**. These two ideas are counterintuitive at first. A model can be bad because it is too simple, but it can also be bad because it is too flexible. In engineering practice, the goal is usually to visualize the data trend, try several plausible model choices, and then judge which model generalizes best rather than which one hugs the current sample most aggressively.

At this point in the frontend tutorial, show a fixed two-panel comparison. The left panel shows underfitting: noisy sample points scatter around the true curved trend, but a rigid low-degree fit misses the curvature. The right panel shows overfitting: the same noisy samples and true trend are shown, but a highly flexible fit wiggles toward the noisy points and can move away from the true trend between samples.

That is why engineers use a **testing set** or other held-out data. The training data are used to compute the model parameters. The testing data are not used in that computation; they are kept separate so we can check whether the fitted model also performs well on unseen samples. In the interactive figure below you can compare against the hidden ground-truth curve directly. In later machine-learning settings, this same idea appears as explicit training and testing data.

Once we choose a model family, parameter computation becomes an optimization problem. We search for the coefficients that minimize the mean squared error over the sampled points:

$$
L = \frac{1}{N}\sum_{i=1}^{N} \left(\hat{y}_i - y_i\right)^2.
$$

For each sampled input `x_i`, the model produces a prediction $\hat{y}_i$. We compare that prediction with the measured value `y_i`, square the error, and average over all samples. The best-fit parameters are the ones that make this average error as small as possible.

Use the figure to test these ideas. Increase the polynomial degree and watch when the model begins to capture bends that a simpler curve misses. Then push the degree too high and see how the curve starts chasing noisy points. Next increase the sample count and observe that with more data, a somewhat more flexible model can sometimes be supported more reliably because the overall trend is revealed more clearly.

The main lesson is not that there is one golden rule for choosing degree. There is not. Real datasets contain randomness, so model selection is partly an engineering judgment informed by plots, testing performance, and domain knowledge. Understanding underfitting, overfitting, and held-out evaluation is more important than memorizing one specific fitting formula.

This is the second important idea: **model fitting is parameter selection under uncertainty, guided by error measures and checked on data that were not used for fitting**.

In the next chapter, this same logic becomes the machine-learning workflow.

### Interactive Figure Placeholder 2 - Noisy Polynomial Curve Fitting

**Figure goal:** Show how model choice affects fitting quality when data contain noise.

**Visual layout:**

- A 2D plot with five data points.
- The data points are generated from a hidden cubic polynomial with random noise.
- A fitted polynomial curve is drawn through or near the points.
- A slider controls the polynomial degree, such as `1` through `8`.
- A small panel displays training error and a qualitative label: underfit, reasonable fit, or overfit.

**Interactions:**

- Students drag a slider to change polynomial degree.
- The curve updates immediately.
- A regenerate button creates a new noisy five-point dataset.
- Optional toggle: show or hide the true noise-free cubic curve.

**Expected observations:**

- Degree `1` may underfit because it cannot bend enough.
- Degree `2` or `3` may capture the trend well.
- Very high degree may pass close to every noisy point but oscillate badly between points.

**Teaching focus:**

- A model should capture the underlying relationship, not merely memorize noise.
- More flexible models can fit data better but may generalize worse.
- The loss function gives a numerical way to judge fit, but a low training loss is not always the same as a good model.

## 3. Machine Learning As Data-Driven Parameter Search

Curve fitting already belongs to the broad idea of machine learning. In Chapter 2 we used a simple polynomial model, but the logic was already the same: use data to choose parameter values so the model can make useful predictions.

The next step is to name the full workflow more clearly. In supervised machine learning, we train a model on known input-output data, then use the trained model to make a prediction at a new input. That prediction stage is called **inference**.

A trained model can be written as:

$$
\hat{y} = f_\theta(x)
$$

Here `theta` represents the learned parameters. Training adjusts `theta` using data. Inference means evaluating the learned function at a new `x` to obtain a predicted output $\hat{y}$.

In this polynomial example, **model complexity** is directly related to the degree we choose. A higher-degree polynomial can bend more and capture a more complicated trend. But if the real trend is fairly simple, or if the dataset is too small, that extra flexibility can easily start matching random noise and become **overfitted**. A lower-degree polynomial is more rigid, so it may miss important curvature and become **underfitted**. So the goal is not to maximize complexity, but to find a **reasonable fit** that captures the main trend without chasing noise. This leads to **generalization**: a good model should behave well not only on the training points, but also on new unseen data.

The interactive figure below makes that idea visible. Yellow points are training data, grey points are hidden test data, and the dashed curve shows the true relationship. Adjust the capacity slider, then drag the cursor to a new `x`. Watch how the model prediction changes, and compare it with the true value at that same location. This is machine-learning inference in its simplest form.

This is the third important idea: **machine learning trains a parameterized model from data so it can make useful predictions on unseen inputs, and its quality is judged by generalization rather than training fit alone**.

In the next chapter, the same logic stays in place, but the model family becomes much more powerful.

$$
L(\theta) = \frac{1}{N}\sum_{i=1}^{N}\left(f_\theta(x_i) - y_i\right)^2.
$$

Training means changing `theta` until the loss becomes smaller.

After training, we can evaluate the function at an input that was not in the original dataset. This is the practical purpose of learning a function. We do not only want to reproduce the known points. We want to predict unknown values.

This leads to three important concepts.

### Underfitting

Underfitting happens when the model is too simple to capture the real relationship. A straight line trying to fit strongly curved data is a typical example. Both training error and prediction error are often high.

### Overfitting

Overfitting happens when the model is flexible enough to memorize noise or accidental patterns in the training data. Training error may become very low, but prediction error at new inputs may be poor.

### Model capacity

Model capacity describes how flexible a model is. A high-capacity model can represent more complicated functions. However, high capacity also makes it easier to overfit or to learn an unstable relationship if training is not controlled.

This is the third important idea: **machine learning is not magic; it is parameter fitting for a selected model family, guided by a loss function and data**.

### Interactive Figure Placeholder 3 - Generalization And Prediction

**Figure goal:** Show the difference between fitting known data and predicting unseen data.

**Visual layout:**

- A 2D plot with training points in one color and hidden test points in another color.
- A fitted polynomial or simple neural-network curve.
- A slider controls model capacity.
- A vertical cursor can be moved to a new `x` location to query the model prediction.
- A panel displays training loss and test loss.

**Interactions:**

- Students adjust model capacity.
- Students move the query cursor to see the predicted value at an unseen input.
- Students toggle hidden test points on and off.

**Expected observations:**

- A model can fit training points well but behave badly between them.
- Test loss is often a better sign of whether the learned function generalizes.
- Capacity must be large enough to learn the trend but not so large that the model chases noise.

**Teaching focus:**

- Prediction at unseen inputs is the reason to learn a function.
- Training loss alone does not guarantee useful prediction.
- Model capacity is a central design choice.

## 4. Deep Learning As A More Powerful Function Model

Deep learning follows the same basic pattern as curve fitting and machine learning, but the chosen model is now a neural network.

In the PINN Playground, the model is a multilayer perceptron, or MLP. An MLP is a function made from layers of simple operations. It is powerful when the mapping in the data is too complicated or unintuitive to describe well with a simple model, and when we have enough data to constrain that flexibility. In engineering, one example is learning a surrogate that maps design or loading parameters to a structural response when the relationship is too complicated to write down directly. Each layer takes numbers in, applies weights and biases, passes the result through an activation function, and sends the output to the next layer.

A simple layer can be written as:

$$
z = Wx + b
$$

$$
h = \sigma(z)
$$

where:

- `x` is the input vector,
- `W` contains weights,
- `b` contains biases,
- `sigma` is an activation function,
- `h` is the layer output.

After many layers, the network becomes a flexible function:

$$
\hat{y} = f_\theta(x).
$$

The symbol `theta` now includes all weights and biases in all layers. A small neural network may have hundreds or thousands of parameters. A large neural network may have millions or billions.

### Loss function in deep learning

The loss function still plays the same role as it did in the polynomial examples from the previous chapters. It measures the difference between the model prediction and the target.

For ordinary supervised learning:

$$
L_{data} = \frac{1}{N}\sum_{i=1}^{N}\left(f_\theta(x_i) - y_i\right)^2.
$$

The key difference is that an MLP is much more complex. With a polynomial model, parameter fitting can often be written as a relatively direct algebraic or least-squares problem. For an MLP, the many layers and nonlinear activations make that kind of analytic solution impractical, so we instead use an **optimizer** to gradually adjust the weights and biases and reduce the loss. In practice, this is usually done with gradient-based methods such as SGD and related variants, but this tutorial stays at a high level. The main idea is simply that training becomes an iterative search for better parameters.

### Epochs and training

An epoch is one pass through the training data or one training iteration over the sampled training points, depending on the setup. In the PINN Playground, an epoch means one optimization step using the current sampled collocation and boundary points.

More epochs usually give the optimizer more chances to reduce the loss. However, more epochs do not guarantee a better answer. A model can converge slowly, become stuck, overfit available data, or reduce one part of the loss while neglecting another.

### Architecture and parameter size

The architecture of an MLP controls its capacity. In the playground, two important architecture settings are:

- hidden width,
- number of hidden layers.

Increasing hidden width gives each layer more neurons. Increasing the number of hidden layers gives the model more stages of transformation. Both usually increase the number of trainable parameters.

A larger model can represent more complicated functions, but it can also be harder to train and harder to interpret.

### Deep learning as a black box

Deep learning is powerful because it can learn complicated functions without the engineer explicitly writing the whole function by hand.

This is also the danger.

After training, a neural network may produce an answer, but it does not automatically explain why that answer is correct. Its internal weights are not usually interpretable in the same way as a small polynomial coefficient or a finite-element stiffness matrix. A smooth-looking output can still be physically wrong.

This is especially important in engineering. A model that looks visually plausible may still violate equilibrium, boundary conditions, material behavior, or stress concentration behavior.

This is the fourth important idea: **deep learning gives us a powerful function approximator, but the result must still be checked against physics, data, and engineering judgment**.

### Interactive Figure Placeholder 4 - Forward Pass, Loss, And Parameter Count In An MLP

**Figure goal:** Show how an input moves through an MLP, how the output is compared to ground truth, and how architecture changes model capacity.

**Visual layout:**

- A small MLP diagram with input nodes, hidden layers, and output nodes.
- A single input value or input pair enters from the left.
- Activations light up layer by layer as the value propagates forward.
- The predicted output appears on the right.
- A ground-truth marker appears beside the prediction.
- A loss indicator shows the squared error between prediction and truth.
- A side panel displays approximate parameter count.

**Interactions:**

- Slider for hidden width.
- Slider for number of hidden layers.
- Toggle for activation function, if desired.
- Input slider to send different input values through the same network.
- Optional step button to animate one layer at a time.

**Expected observations:**

- More layers and more width increase parameter count.
- The model output is the result of many small transformations.
- Loss is computed only after comparing the model output with a target.
- The internal computation can be visualized, but the learned meaning of each parameter is not easy to interpret.

**Teaching focus:**

- Deep learning is still function fitting.
- Training adjusts parameters to reduce a loss.
- Architecture controls capacity.
- The model is powerful but partly black-box.

## 5. From Deep Learning To Physics-Informed Neural Networks

An ordinary supervised neural network learns from data pairs:

$$
(x_i, y_i).
$$

A Physics-Informed Neural Network uses a different idea. Instead of training only from data, we can train the network to satisfy physical laws.

The model still predicts a function. For example, in a two-dimensional mechanics problem, the network may take position as input and predict displacement:

$$
(x,y) \mapsto (u(x,y), v(x,y)).
$$

The difference is that we can use derivatives of this predicted function to check whether physics is satisfied.

### PDE residual loss

Many physical systems are described by differential equations. A differential equation can often be rearranged into a residual form:

$$
R(x) = 0.
$$

If a neural network predicts a field, we can substitute that prediction into the equation. If the prediction satisfies the physics, the residual should be close to zero.

The PDE loss can be written as:

$$
L_{PDE} = \frac{1}{N}\sum_{i=1}^{N} \left|R(x_i)\right|^2.
$$

The points `x_i` where we evaluate the residual are often called collocation points.

### Example: 2D incompressible Navier-Stokes equations

For an incompressible fluid, the velocity field is:

$$
\mathbf{u} = (u, v)
$$

and the pressure is:

$$
p.
$$

The incompressibility equation is:

$$
\frac{\partial u}{\partial x} + \frac{\partial v}{\partial y} = 0.
$$

The momentum equations can be written as residuals. For a steady 2D case, one common form is:

$$
u\frac{\partial u}{\partial x} + v\frac{\partial u}{\partial y}
= -\frac{1}{\rho}\frac{\partial p}{\partial x}
+ \nu\left(\frac{\partial^2u}{\partial x^2}+\frac{\partial^2u}{\partial y^2}\right)
$$

$$
u\frac{\partial v}{\partial x} + v\frac{\partial v}{\partial y}
= -\frac{1}{\rho}\frac{\partial p}{\partial y}
+ \nu\left(\frac{\partial^2v}{\partial x^2}+\frac{\partial^2v}{\partial y^2}\right).
$$

A PINN can predict `u`, `v`, and `p`, then compute the residuals of continuity and momentum. Training reduces those residuals.

### Example: 2D solid mechanics in the PINN Playground

In the current playground, the model predicts displacement:

$$
(x,y) \mapsto (u(x,y), v(x,y)).
$$

From displacement, we compute strain:

$$
\varepsilon_{xx} = \frac{\partial u}{\partial x}
$$

$$
\varepsilon_{yy} = \frac{\partial v}{\partial y}
$$

$$
\gamma_{xy} = \frac{\partial u}{\partial y} + \frac{\partial v}{\partial x}.
$$

From strain, we compute stress using the material law. For plane stress linear elasticity:

$$
\sigma = C\varepsilon.
$$

The physical equilibrium equation is:

$$
\nabla \cdot \sigma = 0.
$$

This becomes the PDE residual for the interior of the solid. In component form:

$$
\frac{\partial \sigma_{xx}}{\partial x} + \frac{\partial \tau_{xy}}{\partial y} = 0
$$

$$
\frac{\partial \tau_{xy}}{\partial x} + \frac{\partial \sigma_{yy}}{\partial y} = 0.
$$

The boundary conditions are also part of the training objective:

- the bottom boundary is fixed,
- the top load patch receives traction,
- other free boundaries should have near-zero traction.

So the total PINN loss is built from several pieces:

$$
L = w_{PDE}L_{PDE} + w_{BC}L_{BC} + w_{data}L_{data}.
$$

The data term may be absent. In a pure PINN, the model may train only from physics residuals and boundary conditions. In a teacher-guided PINN, sparse data from a numerical solution can be added.

This is the fifth important idea: **a PINN trains a neural network not only to fit data, but also to satisfy differential equations and boundary conditions**.

### Interactive Figure Placeholder 5 - Building A PINN Loss From Physics

**Figure goal:** Show how the same neural-network output can be used to compute multiple loss terms.

**Visual layout:**

- A 2D domain with interior collocation points, boundary points, and optional teacher data points.
- A neural network block maps `(x, y)` to `(u, v)`.
- Arrows show automatic differentiation from displacement to strain, stress, and residual.
- Three loss boxes appear: PDE loss, boundary-condition loss, and data/teacher loss.
- A weighted sum forms the total loss.

**Interactions:**

- Toggle PDE loss on and off.
- Toggle boundary loss on and off.
- Toggle data/teacher loss on and off.
- Sliders for `w_PDE`, `w_BC`, and `w_data`.
- Click different point categories in the domain to see which loss term they contribute to.

**Expected observations:**

- Interior points mainly contribute to PDE loss.
- Boundary points contribute to support and traction losses.
- Teacher data points directly compare predicted displacement with reference displacement.
- Changing weights changes which objective dominates training.

**Teaching focus:**

- PINN training is still loss minimization.
- The loss is built from physics, boundary conditions, and optionally data.
- The model output must be differentiable so PDE residuals can be computed.

## 6. Common PINN Failure Modes And Practical Mitigation Tricks

PINNs are attractive because they combine neural networks with physical laws, but they are not automatically reliable. Many PINN failures happen because the optimization problem is difficult, not because the physical equations are wrong.

### Input normalization

Input normalization maps coordinates into a numerically convenient range, often around `[-1, 1]`.

This helps because neural networks are sensitive to scale. If one input varies from `0` to `1` and another varies from `0` to `10,000`, the optimizer may struggle to balance their effects. Even when coordinates are already small, normalization can make the network's activation behavior more stable.

In the playground, input normalization helps the MLP use its capacity more effectively across the domain.

### Loss balancing

PINNs often combine several losses:

$$
L = w_{PDE}L_{PDE} + w_{BC}L_{BC} + w_{data}L_{data}.
$$

If one term is much larger than the others, the optimizer may mostly reduce that term and ignore the rest. For example, the model may reduce interior equilibrium residual while still violating a boundary condition.

Loss weights are therefore not just numerical decorations. They define what the optimizer pays attention to.

### Why pure physics training can be hard

A pure PINN may train without direct data labels. That sounds powerful, but it can be difficult.

The model must discover a field that simultaneously satisfies:

- the governing PDE,
- the boundary conditions,
- the geometry,
- any material assumptions.

The only feedback comes from residuals and boundary losses. If those losses are indirect, sparse, or poorly scaled, training may converge to a field that reduces the loss but still misses important physical behavior.

### Dirichlet versus Neumann boundary conditions

A Dirichlet boundary condition directly specifies the value of the solution. For displacement mechanics:

$$
u = \bar{u}, \quad v = \bar{v}.
$$

This is direct supervision on the model output.

A Neumann boundary condition specifies a derivative-related quantity, such as traction:

$$
\sigma n = \bar{t}.
$$

In the playground, the top load patch is traction-driven. The model predicts displacement, but the load condition is imposed through stress, which depends on displacement gradients. That makes the learning signal more indirect.

This is one reason a plain PINN may learn a plausible-looking displacement field while still under-predicting stress magnitude.

### Why a small amount of data can help

Adding a few reliable data points can significantly improve training. In the playground, teacher-guided PINN training adds sparse FEM displacement samples:

$$
(u_{PINN}, v_{PINN}) \approx (u_{FEM}, v_{FEM}).
$$

These data points act as anchors. They do not replace physics. They help the network find a solution that satisfies physics while also matching trusted reference behavior at selected locations.

For the current traction-driven problem, load-patch teacher points are especially useful because they provide direct displacement guidance exactly where the original boundary condition is indirect.

### Other practical tricks

Several other strategies can improve PINN behavior:

- Use more collocation points in regions with high residuals.
- Add more boundary points where boundary conditions are difficult.
- Use Fourier features or other input encodings to represent sharper spatial variation.
- Start with an easier training objective and gradually increase difficulty.
- Compare against a trusted numerical solution instead of judging by loss curves alone.

This is the sixth important idea: **PINN quality depends strongly on training design, scaling, sampling, boundary-condition type, and the amount of trustworthy guidance available**.

### Interactive Figure Placeholder 6 - PINN Failure Modes And Fixes

**Figure goal:** Show how different training settings affect PINN behavior on the same physical problem.

**Visual layout:**

- A simplified 2D solid domain with a fixed boundary and loaded boundary.
- A side-by-side comparison of predicted field and reference field.
- A small loss panel showing PDE loss, BC loss, and data loss.
- Controls for normalization, boundary-point density, teacher-point count, and loss weights.

**Interactions:**

- Toggle input normalization.
- Adjust the number of teacher points on the load patch.
- Adjust PDE and boundary loss weights.
- Toggle between Dirichlet-style and Neumann-style boundary examples.

**Expected observations:**

- Neumann loading is harder to learn from output-only displacement networks.
- Teacher points can improve stress or displacement quality even when there are few of them.
- Loss curves can look reasonable while the field remains physically weak.

**Teaching focus:**

- PINN failure is often an optimization and formulation issue.
- More physics loss does not automatically mean better physics.
- A small amount of well-placed data can make training much more stable.

## 7. PINNs Beyond Replacing FEM

It is tempting to describe PINNs as an alternative to traditional numerical methods. Sometimes that is useful, but it is not the whole story.

For many engineering problems, FEM is still more mature, more reliable, and easier to verify. A PINN should not be trusted simply because it uses a neural network or because its loss curve decreases.

The deeper advantage of PINNs and related neural surrogates is that they can become fast, differentiable approximations of a physical system after training.

### PINNs as surrogate models

A surrogate model is a cheaper approximation of a more expensive computation. Once trained, a neural network can often evaluate a prediction very quickly.

This can be valuable when the same physical system must be queried many times, such as in:

- design optimization,
- parameter studies,
- uncertainty quantification,
- inverse problems,
- real-time control,
- rapid what-if exploration.

For example, an optimizer may need to test thousands of geometry or load variations. Running a full FEM solve every time may be expensive. A trained surrogate can provide fast approximate evaluations, while selected FEM solves can still be used to verify important candidates.

### PINNs in optimization workflows

Because neural networks are differentiable, they can participate naturally in gradient-based optimization. A trained model can provide not only a prediction, but also derivatives of that prediction with respect to inputs or design variables.

This makes PINN-style models attractive for workflows where the goal is not only to solve one case, but to search through a design space.

### Reducing the black-box burden

The black-box nature of deep learning is a real disadvantage in engineering. One way to reduce that disadvantage is to avoid asking the neural network to learn everything.

Domain knowledge should still do as much work as possible.

Useful deterministic pre-processing may include:

- nondimensionalizing variables,
- normalizing inputs,
- encoding known geometry features,
- separating boundary regions by physical meaning,
- using numerical solutions as reference anchors,
- transforming outputs so simple boundary conditions are automatically satisfied.

Useful deterministic post-processing may include:

- computing stress from displacement using known constitutive laws,
- checking equilibrium residuals,
- comparing against FEM at selected validation cases,
- enforcing engineering constraints after prediction,
- reporting uncertainty or warning flags when the model leaves its trusted regime.

The principle is simple: the less unnecessary work we ask the black-box model to do, the more interpretable and reliable the full workflow becomes.

This is the seventh important idea: **PINNs are most valuable when combined with existing physics knowledge, numerical methods, and engineering checks, not when used as a blind replacement for them**.

### Interactive Figure Placeholder 7 - PINN As A Surrogate In A Design Loop

**Figure goal:** Show that a trained PINN or neural surrogate can be used repeatedly inside an optimization workflow.

**Visual layout:**

- A flow diagram showing design variables entering a surrogate model.
- The surrogate outputs a quantity of interest, such as max displacement or peak stress.
- An optimizer loop proposes a new design.
- Occasional FEM verification checkpoints appear as trusted corrections.
- A warning indicator shows whether the design is inside or outside the surrogate's trusted range.

**Interactions:**

- Slider for a design variable such as load position, frame thickness, or brace width.
- Toggle between direct FEM evaluation and surrogate prediction.
- Button to run a verification point.
- Display of speed difference and prediction error when reference data are available.

**Expected observations:**

- A surrogate can make repeated evaluations faster.
- FEM remains important as a reference and validation tool.
- Pre-processing and post-processing reduce the amount of unexplained behavior left to the neural model.

**Teaching focus:**

- PINNs are not only replacement solvers.
- Their main value may be fast prediction, inverse design, and optimization.
- Engineering knowledge should surround the model before and after prediction.

## Closing Summary

The conceptual path from numerical methods to PINNs can be summarized as follows.

First, students learn that a known function form can be determined by solving for parameters. A quadratic with three unknowns can be recovered from three exact points.

Second, students learn that real data are noisy, so modeling becomes a best-fit problem rather than an exact interpolation problem.

Third, machine learning generalizes this idea: choose a model, define a loss, train parameters, and use the learned function to predict unseen values.

Fourth, deep learning chooses a very powerful model family, such as an MLP. This gives more capacity, but also introduces black-box behavior and training difficulty.

Fifth, PINNs add physics to the training objective. Instead of fitting only data, the model also tries to satisfy PDE residuals and boundary conditions.

Sixth, PINNs can fail when the physics loss is hard to optimize, the boundary conditions are indirect, the sampling is poor, or the model lacks useful anchors. Normalization, better sampling, Fourier features, and sparse teacher data can help.

Finally, PINNs should be understood as part of a larger engineering workflow. Their strongest role may not be replacing FEM in every case. Their strongest role may be providing fast, differentiable, physics-aware surrogate models that work together with numerical methods, domain knowledge, and validation checks.

The main message for students is therefore:

**A PINN is still a model. It can be powerful, but it must be trained, checked, and interpreted with physics-aware engineering judgment.**