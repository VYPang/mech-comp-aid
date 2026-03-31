import numpy as np
from stl import mesh

# Using an existing closed stl file:
your_mesh = mesh.Mesh.from_file('head.stl')

volume, cog, inertia = your_mesh.get_mass_properties()



print("Volume=                                  {0}".format(volume)) # Python 2.7 or above versions
print(f"Volume=                                     {format(volume)}") # Python 3.6 or above versions





print("Position of the center of gravity(COG) = {0}".format(cog))
print("Inertia matrix at expressed at the COG = {0}".format(inertia[0, :]))
print("                                         {0}".format(inertia[1, :]))
print("                                         {0}".format(inertia[2, :]))




from matplotlib import pyplot
from mpl_toolkits import mplot3d
import matplotlib
matplotlib.use('Qt5Agg')
figure = pyplot.figure()
axes = figure.add_subplot(111, projection='3d')
# Render the cube faces
axes.add_collection3d(mplot3d.art3d.Poly3DCollection(your_mesh.vectors))
# Autoscale to the mesh size
scale = your_mesh.points.flatten()
axes.auto_scale_xyz(scale, scale, scale)
# Show the plot to the screen
pyplot.show()