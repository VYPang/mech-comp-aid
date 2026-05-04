# Exercise 1-2 Report: Periodic Surface Modeling

This exercise addresses the two tasks posed in Exercise 1-2: first, to construct a Python function that takes the periodic moments, scale parameter, and basis vectors as inputs and returns the value of the periodic surface function $\psi$; second, to use that function to generate and visualize the Primitive (P), Diamond (D), and Gyroid (G) periodic surfaces. The implementation follows the periodic surface modeling framework reported by Lu and Wang, and the code was organized so that the mathematical evaluator and the surface-visualization pipeline remain conceptually distinct. In this way, the report can discuss both the governing formulation and the resulting geometries without reducing the implementation to a line-by-line code description.

Following Lu and Wang, the periodic surface is defined implicitly by

$$
\psi(\mathbf{r}) = \sum_{l=1}^{L} \sum_{m=1}^{M} \mu_{lm} \cos \left( 2\pi \kappa_l \left( \mathbf{p}_m^T \cdot \mathbf{r} \right) \right) = 0,
$$

where $\mu_{lm}$ denotes the periodic moment, $\kappa_l$ is a scale parameter, $\mathbf{p}_m$ is a basis vector, and $\mathbf{r}$ is the location vector. In the present implementation, the geometric families are generated using fixed parameter sets for each surface type together with a single chosen global scale parameter $\kappa$ for each plot. The computational form used in the code is therefore

$$
\psi(\mathbf{r}) = \sum_{m=1}^{M} \mu_m \cos \left( 2\pi \kappa \left( \mathbf{p}_m^T \cdot \mathbf{r} \right) \right),
$$

with the location vector written in homogeneous form as

$$
\mathbf{r} = [x, y, z, 1]^T.
$$

At a high level, this homogeneous representation allows the parameter matrices to encode not only directional information but also constant phase offsets, which is how the different periodic topologies are constructed in compact matrix form.

The first part of the exercise was fulfilled by implementing a numerical evaluator for $\psi(\mathbf{r})$ in Python. Given a point or a collection of points in space, together with $\mu$, $\kappa$, and the matrix of basis vectors, the function computes the cosine terms and sums them to obtain the scalar field value. The second part of the exercise was then achieved by evaluating the same function over a structured three-dimensional grid and extracting the zero level set $\psi = 0$ using the marching cubes algorithm. The resulting triangulated surface was finally rendered for visual inspection. This workflow makes the mathematical model directly responsible for the plotted geometry, which is the central purpose of the exercise.

For the Primitive surface, the implemented parameter set is

$$
\boldsymbol{\mu}^{(P)} = [1,\,1,\,1],
$$

and

$$
[\mathbf{p}_1,\mathbf{p}_2,\mathbf{p}_3]^{(P)} =
\begin{bmatrix}
1 & 0 & 0 \\
0 & 1 & 0 \\
0 & 0 & 1 \\
0 & 0 & 0
\end{bmatrix}.
$$

For the Diamond surface, the implemented parameter set is

$$
\boldsymbol{\mu}^{(D)} = [1,\,1,\,1,\,1,\,-1,\,1,\,1,\,-1],
$$

and

$$
[\mathbf{p}_1,\ldots,\mathbf{p}_8]^{(D)} =
\begin{bmatrix}
1 & 1 & 1 & 1 & -1 & 1 & 1 & -1 \\
1 & -1 & -1 & 1 & 1 & -1 & -1 & -1 \\
-1 & 1 & -1 & 1 & -1 & 1 & -1 & 1 \\
0 & 0 & 0 & 0 & \tfrac{1}{4} & \tfrac{1}{4} & \tfrac{1}{4} & \tfrac{1}{4}
\end{bmatrix}.
$$

For the Gyroid surface, the implemented parameter set is

$$
\boldsymbol{\mu}^{(G)} = [1,\,1,\,1,\,1,\,1,\,-1],
$$

and

$$
[\mathbf{p}_1,\ldots,\mathbf{p}_6]^{(G)} =
\begin{bmatrix}
-1 & -1 & 0 & 0 & -1 & -1 \\
-1 & 1 & -1 & -1 & 0 & 0 \\
0 & 0 & -1 & 1 & -1 & 1 \\
\tfrac{1}{4} & \tfrac{1}{4} & \tfrac{1}{4} & \tfrac{1}{4} & \tfrac{1}{4} & \tfrac{1}{4}
\end{bmatrix}.
$$

These parameter sets distinguish the three topologies by altering the directional combinations and phase shifts that appear inside the cosine terms. Although the functional structure remains the same, changing $\mu$ and $\mathbf{p}_m$ changes the symmetry and connectivity of the zero level set, thereby producing the P, D, and G families.

To illustrate the effect of the scale parameter, three representative values were selected for each surface family: $\kappa = 0.5$, $\kappa = 1.0$, and $\kappa = 1.5$. Within a fixed plotting domain, increasing $\kappa$ increases the spatial frequency of the trigonometric field. As a consequence, more repeated cells of the periodic structure appear within the same spatial window, and the extracted surface becomes more densely patterned. Conversely, smaller values of $\kappa$ produce a coarser structure with fewer repetitions and larger visible features. This is sufficient for the purposes of the exercise, since the task only requires that an admissible scale parameter be chosen and that its effect on the resulting geometry be observed.

<p align="center">(image here)</p>
<p align="center"><em>Figure 1. Primitive (P) periodic surface generated using the current implementation. The three subfigures show the surface for $\kappa = 0.5$, $\kappa = 1.0$, and $\kappa = 1.5$ from left to right.</em></p>

<p align="center">(image here)</p>
<p align="center"><em>Figure 2. Diamond (D) periodic surface generated using the current implementation. The three subfigures show the surface for $\kappa = 0.5$, $\kappa = 1.0$, and $\kappa = 1.5$ from left to right.</em></p>

<p align="center">(image here)</p>
<p align="center"><em>Figure 3. Gyroid (G) periodic surface generated using the current implementation. The three subfigures show the surface for $\kappa = 0.5$, $\kappa = 1.0$, and $\kappa = 1.5$ from left to right.</em></p>

The visual results confirm that the implemented function is able to reproduce three distinct periodic surface families from the same general mathematical framework. The Primitive surface exhibits a comparatively direct orthogonal periodicity, the Diamond surface presents a more interconnected lattice-like morphology, and the Gyroid surface displays the characteristic smoothly winding structure associated with this family. Across all three cases, changing the scale parameter modifies the density of the pattern without changing the fundamental topological identity defined by the chosen parameter set. This observation is consistent with the role of $\kappa$ in the governing equation.

In summary, Exercise 1-2 demonstrates how an implicit periodic surface model can be translated into a compact and reusable computational pipeline. The implementation begins with the mathematical definition of $\psi$, applies specific parameter sets for the Primitive, Diamond, and Gyroid families, evaluates the scalar field on a grid, and extracts the zero isosurface for visualization. The results show that the same mathematical function can generate multiple metamaterial surface families, while the scale parameter provides a simple mechanism for controlling the spatial repetition of the generated structure.

## Reference

Lu, Y., & Wang, Y. (2022). Structural optimization of metamaterials based on periodic surface modeling. <em>Computer Methods in Applied Mechanics and Engineering</em>, 395, 115057.