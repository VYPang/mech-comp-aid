import math
import stl
from stl import mesh
import numpy as np

# find the max dimensions,so we can know the bounding box,getting the height,
# width, length (because these are the step size)...
def find_mins_maxs(obj):
    minx = obj.x.min()
    maxx = obj.x.max()
    miny = obj.y.min()
    maxy = obj.y.max()
    minz = obj.z.min()
    maxz = obj.z.max()
    return minx, maxx, miny, maxy, minz, maxz

def translate(_solid, step, padding, multiplier, axis):
    if 'x' == axis:
        items = 0, 3, 6
    elif 'y' == axis:
        items = 1, 4, 7
    elif 'z' == axis:
        items = 2, 5, 8
    else:
        raise RuntimeError('Unknown axis sr,expected x,y or z' % axis)
    _solid.points[:, items] += (step * multiplier) + (padding*multiplier)

def copy_obj(obj, dims, num_rows, num_cols, num_layers):
    w, l, h = dims
    copies = []
    for layer in range(num_layers):
        for row in range(num_rows):
            for col in range(num_cols):
                # skip the position where original being copied is
                if row == 0 and col == 0 and layer == 0:
                    continue
                _copy = mesh.Mesh(obj.data.copy())
                # pad the space between objects by 10% of the dimension being
                # #translated
                if col != 0:
                    translate(_copy, w, w/5., col, 'x')
                if row != 0:
                    translate(_copy, l, l/5., row, 'y')
                if layer != 0:
                    translate(_copy, h, h/5., layer, 'z')
                copies.append(_copy)
    return copies

# Using an existing stl file:
main_body = mesh.Mesh.from_file('dragon.stl')

# rotate along Y
main_body.rotate([0.0, 0.5, 0.0], math.radians(90))

minx, maxx, miny, maxy, minz, maxz = find_mins_maxs(main_body)
w1 = maxx - minx
l1 = maxy - miny
h1 = maxz - minz
copies = copy_obj(main_body, (w1, l1, h1), 2, 2, 2)

# I wanted to add another related STL to the final STL
# twist_lock = mesh.Mesh.from_file('cube.stl')

# minx, maxx, miny, maxy, minz, maxz = find_mins_maxs(twist_lock)
# w2 = (maxx - minx) * 10
# l2 = maxy - miny
# h2 = maxz - minz
# translate(twist_lock, w1, w1/10., 3, 'x')
# copies2 = copy_obj(twist_lock, (w2, l2, h2), 2, 2, 1)

# combined = mesh.Mesh(np.concatenate([main_body.data, twist_lock.data]+[copy.data for copy in copies]+[copy.data for copy in copies2]))

combined = mesh.Mesh(np.concatenate([main_body.data]+[copy.data for copy in copies]))
# save as ASCII
combined.save('combined-2.stl', mode=stl.Mode.ASCII)


from matplotlib import pyplot
from mpl_toolkits import mplot3d
figure = pyplot.figure()
axes = figure.add_subplot(111, projection='3d')
# Render the cube faces
axes.add_collection3d(mplot3d.art3d.Poly3DCollection(combined.vectors))
# Autoscale to the mesh size
scale = combined.points.flatten()
axes.auto_scale_xyz(scale, scale, scale)
# Show the plot to the screen
pyplot.show()