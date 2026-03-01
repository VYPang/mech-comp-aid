from skimage import measure
import numpy as np
import matplotlib.pyplot as plt

def r_min(a, b,alpha=0.5):
    return a + b - np.sqrt(a**2 + b**2 - 2*alpha*a*b)

def r_max(a, b,alpha=0.5):
    return a + b + np.sqrt(a**2 + b**2 - 2*alpha*a*b)

x, y, z = np.mgrid[-1:1:51j, -1:1:51j, -1:1:51j]
# -1:1:51j means range from -1 to 1 with 51 points (including endpoints)
# x, y, z are all within the shape of (51, 51, 51)
print(x.shape, y.shape, z.shape)

F_A = x**2 + y**2 + z**2 - 1 # sphere implicit function
F_B = x**2 + y**2 - 0.2 * z**2 # cone implicit function

# using min and max functions
F_U_simple = np.minimum(F_A, F_B) # union
F_I_simple = np.maximum(F_A, F_B) # intersection
F_D_simple = np.maximum(F_A, -F_B) # difference

# using R function
alpha = 0.5
F_U = r_min(F_A, F_B, alpha=alpha) # union
F_I = r_max(F_A, F_B, alpha=alpha) # intersection
F_D = r_max(F_A, -F_B, alpha=alpha) # difference

# Transform the implicit F into vertices, triangle connectivity and normals
verts, faces, normals, values = measure.marching_cubes(F_U, 0, spacing=(0.02, 0.02, 0.02))

fig = plt.figure()
ax = fig.add_subplot(111, projection='3d')

ax.plot_trisurf(verts[:, 0]-1, verts[:, 1]-1, faces, verts[:, 2]-1)
plt.show()