# Exercise 1-1 Report: STL Visualization, Rotation, and Surface Area Evaluation

This exercise addresses the three tasks posed in Exercise 1-1: reading and visualizing two STL vase models, rotating each model by two different computational methods, and evaluating the total surface area of each triangulated surface. The implementation was designed as a small command-line workflow rather than a single monolithic script. In particular, `typer` was used to organize the program into separate user-facing commands for visualization, rotation, and area evaluation, while `numpy-stl`, `numpy`, and `pyvista` were used to separate mesh loading, numerical processing, and graphical rendering. This structure makes it possible to verify each question independently while preserving a consistent geometric pipeline.

At a high level, the program first reads the STL data for the Tessa vase and the Twisted vase, then converts the triangular mesh data into a format suitable for interactive rendering. The same mesh representation is subsequently reused for two rotation strategies and for two independent surface-area calculations. This design was adopted to make the numerical comparisons meaningful: both the manual and built-in methods operate on the same underlying mesh data, so any observed discrepancy can be attributed to the computational method rather than to differences in preprocessing.

## Visualization of the STL Models

The first task was to load and visualize the two triangulated vase geometries. Each STL file stores the geometry as a collection of triangular facets, where every face is defined by three vertices in three-dimensional space. After loading the mesh, the vertices and face connectivity were transferred into a `pyvista.PolyData` object for visualization. This conversion allowed the original models to be displayed interactively with a consistent plotting backend, making it straightforward to inspect the geometry before any transformation was applied.

## Rotation Methodology

The second task required each model to be rotated first about the $x$-axis by $\pi/4$ clockwise and then about the $y$-axis by $\pi/3$ counter-clockwise. Using the usual right-hand-rule sign convention, the implemented angles were

$$
\theta_x = -\frac{\pi}{4}, \qquad \theta_y = \frac{\pi}{3}.
$$

The standard rotation matrices are

$$
R_x(\theta_x) =
\begin{bmatrix}
1 & 0 & 0 \\
0 & \cos\theta_x & -\sin\theta_x \\
0 & \sin\theta_x & \cos\theta_x
\end{bmatrix},
$$

and

$$
R_y(\theta_y) =
\begin{bmatrix}
\cos\theta_y & 0 & \sin\theta_y \\
0 & 1 & 0 \\
-\sin\theta_y & 0 & \cos\theta_y
\end{bmatrix}.
$$

In the custom implementation, these matrices were applied directly to every stored vertex in sequence. Because the STL package stores coordinates in a row-wise format and its built-in `mesh.rotate()` routine multiplies rotations on the right of row vectors, the program follows the same computational ordering when updating the mesh coordinates. The custom method therefore performs the same rotation sequence as the library routine while exposing the matrix construction explicitly. This is useful pedagogically because it shows how the transformation arises from linear algebra rather than treating the library call as a black box.

The second rotation method used the built-in `mesh.rotate()` function provided by `numpy-stl`, again applying the $x$-axis rotation first and the $y$-axis rotation second. The purpose of the comparison was to confirm that the custom matrix-based implementation reproduces the library behavior. To support this comparison quantitatively, the script was extended to compute the maximum absolute coordinate difference, the root-mean-square coordinate difference, and the maximum pointwise Euclidean distance between the two rotated meshes.

<p align="center">(image here)</p>
<p align="center"><em>Figure 1. Rotation comparison for the Twisted vase, with the original model on the left, the custom matrix rotation in the middle, and the built-in `mesh.rotate()` result on the right.</em></p>

<p align="center">(image here)</p>
<p align="center"><em>Figure 2. Rotation comparison for the Tessa vase, with the original model on the left, the custom matrix rotation in the middle, and the built-in `mesh.rotate()` result on the right.</em></p>

## Surface Area Methodology

The third task was to compute the total surface area of each STL model by two methods. In the manual approach, the area of each triangular facet was evaluated using the cross product of two edge vectors. For a triangle with vertices $\mathbf{v}_0$, $\mathbf{v}_1$, and $\mathbf{v}_2$, the area is

$$
A_i = \frac{1}{2}\left\| (\mathbf{v}_1 - \mathbf{v}_0) \times (\mathbf{v}_2 - \mathbf{v}_0) \right\|.
$$

If the mesh contains $N$ triangular faces, the total surface area is

$$
A_{\text{total}} = \sum_{i=1}^{N} A_i.
$$

This expression was implemented by forming the two edge vectors for every triangle, computing their cross products, taking the Euclidean norm of each result, and summing the corresponding face areas. In the second approach, the built-in `mesh.areas` property from `numpy-stl` was summed directly. Comparing the two values provides a direct verification that the manual vector-calculus implementation is consistent with the library routine.

## Results and Discussion

The computed surface areas are reported in Table 1. For both the Twisted vase and the Tessa vase, the manual cross-product computation and the built-in `mesh.areas` calculation produced identical totals to the displayed numerical precision. The absolute difference between the two methods was zero within the reported floating-point output, which indicates that the manual implementation was carried out correctly.

| Model | Manual cross-product area | Built-in `mesh.areas.sum()` | Absolute difference |
| --- | ---: | ---: | ---: |
| Twisted vase | 65392.613281 | 65392.613281 | 0.000000e+00 |
| Tessa vase | 19166.138672 | 19166.138672 | 0.000000e+00 |

Table 1. Comparison of total surface area obtained by the manual cross-product method and the built-in STL area routine.

The rotation comparison is summarized in Table 2. The measured discrepancies between the custom implementation and `mesh.rotate()` were very small, with maximum pointwise differences on the order of $10^{-5}$. Relative to the overall size of the vase geometries, these values are negligible and can be attributed to floating-point round-off rather than to a meaningful geometric difference. Consequently, the two rotation methods may be regarded as effectively identical for this exercise.

| Model | Max absolute coordinate difference | RMS coordinate difference | Max pointwise Euclidean distance |
| --- | ---: | ---: | ---: |
| Twisted vase | 1.525879e-05 | 1.939450e-06 | 1.705985e-05 |
| Tessa vase | 3.814697e-06 | 5.650856e-07 | 4.264961e-06 |

Table 2. Numerical difference between the custom rotation-matrix implementation and the built-in `mesh.rotate()` method.

Overall, the exercise demonstrates that the STL-processing pipeline is both numerically consistent and modular. The visualization stage confirms that the two imported meshes are read correctly, the rotation study shows that a manually constructed matrix implementation can reproduce the library routine to within round-off error, and the surface-area study confirms that the geometric cross-product formula agrees exactly with the built-in area computation. From a software-design perspective, the use of a command-line interface with separate commands for visualization, rotation, and area evaluation makes the implementation easier to test, extend, and explain in a report setting.