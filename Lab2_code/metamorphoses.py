from skimage import measure
import numpy as np
import matplotlib.pyplot as plt

x, y, z = np.mgrid[-1:1:51j, -1:1:51j, -1:1:51j]
r_cyl = 0.5
F_cyl = x**2 + y**2 - r_cyl**2

a= 0.8
F_double_cone = x**2 + y**2 - a*z**2

F_cut = -z

# Using boolean operation to cut the double cone into single cone
F_cone = np.maximum(F_double_cone, F_cut)

# Define mu values to visualize
mu_values = [0, 0.25, 0.5, 0.75, 1]

# Create a figure with subplots
fig = plt.figure(figsize=(20, 4))

for i, mu in enumerate(mu_values):
    # metamorphoses operation
    F_metamorphoses = mu * F_cone + (1-mu) * F_cyl

    # Transform the implicit F into vertices, triangle connectivity and normals
    try:
        verts, faces, normals, values = measure.marching_cubes(F_metamorphoses, 0, spacing=(0.02, 0.02, 0.02))
        
        ax = fig.add_subplot(1, 5, i+1, projection='3d')
        ax.plot_trisurf(verts[:, 0]-1, verts[:, 1]-1, faces, verts[:, 2]-1)
        ax.set_title(f'mu = {mu}')
        ax.set_xlabel('X')
        ax.set_ylabel('Y')
        ax.set_zlabel('Z')
    except RuntimeError:
        print(f"Could not generate mesh for mu={mu} (possibly empty surface)")

plt.tight_layout()
plt.savefig('metamorphoses_comparison.png')
print("Image saved as metamorphoses_comparison.png")
plt.show()