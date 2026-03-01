# # pip install pyvista
# # pip install vtk

import pyvista as pv
from stl import mesh

your_mesh = mesh.Mesh.from_file('Lab2_code/lab2 codes/stl_files/head.stl')

vertices = your_mesh.points.reshape(-1, 3)
faces = []
for i in range(len(your_mesh.vectors)):
    faces.append([3, i * 3, i * 3 + 1, i * 3 + 2])
faces = pv.numpy_to_idarr(faces)

polydata = pv.PolyData(vertices, faces)

plotter = pv.Plotter()
plotter.add_mesh(polydata, color='lightblue', show_edges=True)
plotter.set_background("white")
plotter.show()




# from stl import mesh
# from mpl_toolkits import mplot3d
# from matplotlib import pyplot
# import matplotlib
# matplotlib.use('Qt5Agg')

# # Create a new plot
# figure = pyplot.figure()
# # axes = mplot3d.Axes3D(figure)
# axes = figure.add_subplot(111, projection='3d')
# # Load the STL files and add the vectors to the plot
# your_mesh = mesh.Mesh.from_file('head.stl')
# axes.add_collection3d(mplot3d.art3d.Poly3DCollection(your_mesh.vectors))
# # Auto scale to the mesh size
# scale = your_mesh.points.flatten()
# axes.auto_scale_xyz(scale, scale, scale)
# # Show the plot to the screen
# pyplot.show()