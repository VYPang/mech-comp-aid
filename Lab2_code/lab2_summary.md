# Lab 2 Summary: STL Processing and Implicit Modeling

## Table of Contents
1. [Create STL File with Python](#1-create-stl-file-with-python)
   - [Numpy-stl Module and Properties](#numpy-stl-module-and-properties)
   - [Plot STL File](#plot-stl-file)
   - [Modify Mesh Objects](#modify-mesh-objects)
   - [Creating Mesh Objects from Vertices and Faces](#creating-mesh-objects-from-vertices-and-faces)
   - [Evaluating Mesh Properties](#evaluating-mesh-properties)
   - [Combining Multiple STL Files](#combining-multiple-stl-files)
2. [Implicit Surface Modeling](#2-implicit-surface-modeling)
   - [Create and Visualize Implicit Surface in Python](#create-and-visualize-implicit-surface-in-python)
   - [Boolean Operation](#boolean-operation)
   - [Boolean Operation with R-Function](#boolean-operation-with-r-function)
   - [Metamorphoses of Implicit Surfaces](#metamorphoses-of-implicit-surfaces)

---

## 1. Create STL File with Python

### Numpy-stl Module and Properties
The `numpy-stl` library enables reading and creating 3D meshes. You can load an existing `.stl` file and access its basic properties such as normals and vertices.

**Example (`code1.py`):**
```python
import numpy as np
from stl import mesh

# Load an existing STL file
your_mesh = mesh.Mesh.from_file('stl_files/transformers 2 Phone.STL')

# The mesh normals (calculated automatically)
print(your_mesh.normals)

# Accessing internal vectors directly
print(your_mesh.v0, your_mesh.v1, your_mesh.v2)
```

### Plot STL File
Once loaded, you can manipulate the vertices and use visualization libraries like `pyvista` or `matplotlib` (`mpl_toolkits.mplot3d`) to plot the STL object.

**Example (`code2.py`):**
```python
import pyvista as pv
from stl import mesh

your_mesh = mesh.Mesh.from_file('stl_files/head.stl')
vertices = your_mesh.points.reshape(-1, 3)

# Extracting faces connectivity
faces = []
for i in range(len(your_mesh.vectors)):
    faces.append([3, i * 3, i * 3 + 1, i * 3 + 2])
faces = pv.numpy_to_idarr(faces)

polydata = pv.PolyData(vertices, faces)
plotter = pv.Plotter()
plotter.add_mesh(polydata, color='lightblue', show_edges=True)
plotter.show()
```

### Modify Mesh Objects
A created or loaded mesh can be modified through transformations such as rotations and translations along its X, Y, and Z axes.

**Example (`code3.py`):**
```python
from stl import mesh
import numpy, math

# Create surface data...
data = numpy.zeros(6, dtype=mesh.Mesh.dtype)
# Generate multiple mesh copies
meshes = [mesh.Mesh(data.copy()) for _ in range(4)]

# Rotate 90 degrees over the Y axis
meshes[0].rotate([0.0, 1.0, 0.0], math.radians(90))

# Translate by modifying X and Y coordinates
meshes[2].x += 2
meshes[2].y += 2
```

### Creating Mesh Objects from Vertices and Faces
Instead of manually defining 3D faces vector by vector, you can define an array of vertices and specify the connectivity to build standard shapes like cubes.

**Example (`code4.py`):**
```python
import numpy as np
from stl import mesh

# Define standard vertices
vertices = np.array([[-1, -1, -1], [+1, -1, -1], [+1, +1, -1], [-1, +1, -1],
                     [-1, -1, +1], [+1, -1, +1], [+1, +1, +1], [-1, +1, +1]])

# Define standard triangular connectivity
faces = np.array([[0, 3, 1], [1, 3, 2], [0, 4, 7], [0, 7, 3],
                  [4, 5, 6], [4, 6, 7], [5, 1, 2], [5, 2, 6],
                  [2, 3, 6], [3, 7, 6], [0, 1, 5], [0, 5, 4]])

cube = mesh.Mesh(np.zeros(faces.shape[0], dtype=mesh.Mesh.dtype))
for i, f in enumerate(faces):
    for j in range(3):
        cube.vectors[i][j] = vertices[f[j], :]

cube.save('cube.stl')
```

### Evaluating Mesh Properties
Physical and spatial analysis properties can be generated natively in `numpy-stl` with the `get_mass_properties()` method. This returns the volume, the center of gravity (COG), and the inertia matrix.

**Example (`code5.py`):**
```python
from stl import mesh

your_mesh = mesh.Mesh.from_file('stl_files/head.stl')

volume, cog, inertia = your_mesh.get_mass_properties()

print(f"Volume: {volume}")
print(f"COG: {cog}")
print(f"Inertia Matrix: \n{inertia}")
```

### Combining Multiple STL Files
By analyzing bounding box dimensions, a script can dynamically duplicate a mesh pattern into a 3D grid layout, spacing objects automatically and returning multiple localized copies.

**Example (`code6.py`):**
```python
def find_mins_maxs(obj):
    return obj.x.min(), obj.x.max(), obj.y.min(), obj.y.max(), obj.z.min(), obj.z.max()

def copy_obj(obj, dims, num_rows, num_cols, num_layers):
    w, l, h = dims
    copies = []
    # Loop layers, rows, columns, then duplicate and translate ...
    # Return copies list
    return copies
```

---

## 2. Implicit Surface Modeling

### Create and Visualize Implicit Surface in Python
A coordinate grid created using `np.mgrid` provides the 3D space. Mathematical functions mapped against this space define shapes (functions less than 0 represent the interior).

**Example (`implicit.py`):**
```python
import numpy as np
from skimage import measure

# Create 3D grid setup
x, y, z = np.mgrid[-1:1:51j, -1:1:51j, -1:1:51j]

# Sphere implicit function
F_A = x**2 + y**2 + z**2 - 1 

# Visualizing implicit function via marching cubes
verts, faces, normals, values = measure.marching_cubes(F_A, 0, spacing=(0.02, 0.02, 0.02))
```

### Boolean Operation
Simple boolean operations (min/max structures) permit you to combine implicit equations to execute basic unions, intersections, and differences.

**Example (`implicit.py`):**
```python
F_B = x**2 + y**2 - 0.2 * z**2 # Cone equation

F_U_simple = np.minimum(F_A, F_B) # Union
F_I_simple = np.maximum(F_A, F_B) # Intersection
F_D_simple = np.maximum(F_A, -F_B) # Difference
```

### Boolean Operation with R-Function
An R-function applies smooth structural bindings (fillets/blends) for boolean logic, utilizing an extra modifier parameter `alpha`.

**Example (`implicit.py`):**
```python
def r_min(a, b, alpha=0.5):
    return a + b - np.sqrt(a**2 + b**2 - 2*alpha*a*b)

def r_max(a, b, alpha=0.5):
    return a + b + np.sqrt(a**2 + b**2 - 2*alpha*a*b)

alpha = 0.5
F_U = r_min(F_A, F_B, alpha=alpha) # Union with blending
F_D = r_max(F_A, -F_B, alpha=alpha) # Difference with blending
```

### Metamorphoses of Implicit Surfaces
Transforming an object smoothly into another (metamorphosis) is manageable by shifting weight progressively between two specific boolean configurations using an interpolator variable (`mu`).

**Example (`metamorphoses.py`):**
```python
F_cyl = x**2 + y**2 - 0.5**2 # Cylinder
F_cone = np.maximum(x**2 + y**2 - 0.8*z**2, -z) # Single Cone Boolean Cut

# Iterate over a weight matrix to see structural change
mu_values = [0, 0.25, 0.5, 0.75, 1]

for mu in mu_values:
    # Metamorphose sequence logic
    F_metamorphoses = mu * F_cone + (1-mu) * F_cyl
```
