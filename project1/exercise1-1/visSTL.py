import os
import math
import numpy as np
import pyvista as pv
from stl import mesh
import typer
from rich.console import Console
from enum import Enum

app = typer.Typer(help="Tool to visualize and rotate STL files.")
console = Console()

class ModelOption(str, Enum):
    twisted = "twisted"
    tessa = "tessa"
    both = "both"

class SingleModelOption(str, Enum):
    twisted = "twisted"
    tessa = "tessa"

def get_file_path(model_name: str) -> str:
    current_dir = os.path.dirname(os.path.abspath(__file__))
    if model_name == "twisted":
        return os.path.join(current_dir, 'Twisted_Vase_Basic_Voronoi_Style-1.stl')
    elif model_name == "tessa":
        return os.path.join(current_dir, 'tessa_vase_filled-2.stl')
    raise ValueError(f"Unknown model name: {model_name}")

def create_polydata_from_mesh(your_mesh):
    """
    Takes a numpy-stl Mesh object and returns a pyvista PolyData object
    """
    vertices = your_mesh.points.reshape(-1, 3)

    faces = []
    for i in range(len(your_mesh.vectors)):
        faces.append([3, i * 3, i * 3 + 1, i * 3 + 2])
    
    faces = pv.numpy_to_idarr(faces)
    polydata = pv.PolyData(vertices, faces)
    
    return polydata

def create_polydata_from_stl(filepath):
    """
    Reads an STL file and returns a pyvista PolyData object
    using create_polydata_from_mesh
    """
    your_mesh = mesh.Mesh.from_file(filepath)
    return create_polydata_from_mesh(your_mesh)

def create_rotation_matrix_x(angle):
    """Create rotation matrix for X axis"""
    c, s = np.cos(angle), np.sin(angle)
    return np.array([
        [1, 0, 0],
        [0, c, -s],
        [0, s, c]
    ])

def create_rotation_matrix_y(angle):
    """Create rotation matrix for Y axis"""
    c, s = np.cos(angle), np.sin(angle)
    return np.array([
        [c, 0, s],
        [0, 1, 0],
        [-s, 0, c]
    ])

def apply_custom_rotation(your_mesh, angle_x, angle_y):
    """
    Applies custom rotation matrices to mesh vertices.
    V_rotated = V * R_x^T * R_y^T  which is equivalent to multiplying by rot matrices.
    """
    rot_mesh = mesh.Mesh(your_mesh.data.copy())
    
    R_x = create_rotation_matrix_x(angle_x)
    R_y = create_rotation_matrix_y(angle_y)
    
    for i in range(len(rot_mesh.vectors)):
        for j in range(3):
            v = rot_mesh.vectors[i][j]
            v_rot_x = np.dot(v, R_x)
            v_rot_xy = np.dot(v_rot_x, R_y)
            rot_mesh.vectors[i][j] = v_rot_xy
            
    return rot_mesh

def apply_stl_rotation(your_mesh, angle_x, angle_y):
    """
    Applies rotation using numpy-stl built-in rotate function.
    """
    rot_mesh = mesh.Mesh(your_mesh.data.copy())
    
    rot_mesh.rotate([1.0, 0.0, 0.0], angle_x)
    rot_mesh.rotate([0.0, 1.0, 0.0], angle_y)
    
    return rot_mesh

@app.command()
def visualize(
    model: ModelOption = typer.Option(ModelOption.both, help="Model to visualize: twisted, tessa, or both")
):
    """
    Read and visualize STL files of the given tessa_vase or twisted_vase.
    """
    console.print(f"[bold green]Visualizing STL files with option: {model.value}[/bold green]")
    
    if model == ModelOption.both:
        plotter = pv.Plotter(shape=(1, 2))
        
        console.print("[cyan]Loading Twisted Vase...[/cyan]")
        file1 = get_file_path("twisted")
        poly1 = create_polydata_from_stl(file1)
        plotter.subplot(0, 0)
        plotter.add_text("Twisted Vase", font_size=10)
        plotter.add_mesh(poly1, color='lightblue', show_edges=True)
        
        console.print("[cyan]Loading Tessa Vase...[/cyan]")
        file2 = get_file_path("tessa")
        poly2 = create_polydata_from_stl(file2)
        plotter.subplot(0, 1)
        plotter.add_text("Tessa Vase", font_size=10)
        plotter.add_mesh(poly2, color='lightgreen', show_edges=True)
        
        plotter.link_views()
        console.print("[bold green]Showing both models...[/bold green]")
        plotter.show()
        
    else:
        plotter = pv.Plotter()
        
        if model == ModelOption.twisted:
            console.print("[cyan]Loading Twisted Vase...[/cyan]")
            file_path = get_file_path("twisted")
            name = "Twisted Vase"
            color = 'lightblue'
        else:
            console.print("[cyan]Loading Tessa Vase...[/cyan]")
            file_path = get_file_path("tessa")
            name = "Tessa Vase"
            color = 'lightgreen'
            
        poly = create_polydata_from_stl(file_path)
        plotter.add_text(name, font_size=10)
        plotter.add_mesh(poly, color=color, show_edges=True)
        
        console.print(f"[bold green]Showing {name}...[/bold green]")
        plotter.show()

@app.command()
def rotate(
    model: SingleModelOption = typer.Option(SingleModelOption.twisted, help="Model to rotate: twisted or tessa")
):
    """
    Rotate about x-axis for π/4 clock-wise and then about y-axis for π/3 counter-clock-wise in two methods.
    """
    console.print(f"[bold magenta]Rotating {model.value} vase...[/bold magenta]")
    
    file_path = get_file_path(model.value)
    
    console.print("[cyan]Loading mesh...[/cyan]")
    original_mesh = mesh.Mesh.from_file(file_path)

    angle_x = -math.pi / 4
    angle_y = math.pi / 3

    console.print("[cyan]Applying rotations...[/cyan]")
    
    mesh_custom = apply_custom_rotation(original_mesh, angle_x, angle_y)
    poly_custom = create_polydata_from_mesh(mesh_custom)

    mesh_builtin = apply_stl_rotation(original_mesh, angle_x, angle_y)
    poly_builtin = create_polydata_from_mesh(mesh_builtin)
    
    original_poly = create_polydata_from_mesh(original_mesh)

    plotter = pv.Plotter(shape=(1, 3))

    plotter.subplot(0, 0)
    plotter.add_text("Original Model", font_size=10)
    plotter.add_mesh(original_poly, color='lightblue', show_edges=False)
    plotter.show_axes()

    plotter.subplot(0, 1)
    plotter.add_text("Method 1: Custom Rotation Matrices", font_size=10)
    plotter.add_mesh(poly_custom, color='lightgreen', show_edges=False)
    plotter.show_axes()
    
    plotter.subplot(0, 2)
    plotter.add_text("Method 2: mesh.rotate() built-in", font_size=10)
    plotter.add_mesh(poly_builtin, color='lightcoral', show_edges=False)
    plotter.show_axes()
    
    plotter.link_views()
    console.print("[bold green]Showing rotated models comparison...[/bold green]")
    plotter.show()

@app.command()
def area(
    model: SingleModelOption = typer.Option(SingleModelOption.twisted, help="Model to calculate area: twisted or tessa")
):
    """
    Calculate the total surface area for the selected model using two methods:
    1) Manual cross-product
    2) numpy-stl built-in areas
    """
    console.print(f"[bold magenta]Calculating surface area for {model.value} vase...[/bold magenta]")
    
    file_path = get_file_path(model.value)
    
    console.print("[cyan]Loading mesh...[/cyan]")
    my_mesh = mesh.Mesh.from_file(file_path)

    # Method 1: Manual cross product calculation
    # vectors shape is (N, 3, 3) where N is number of faces
    # For each face, we have 3 vertices (v0, v1, v2)
    v0 = my_mesh.vectors[:, 0]
    v1 = my_mesh.vectors[:, 1]
    v2 = my_mesh.vectors[:, 2]
    
    # Edges
    edge1 = v1 - v0
    edge2 = v2 - v0
    
    # Cross product of the edges
    cross_products = np.cross(edge1, edge2)
    
    # Magnitude of cross products gives 2 * Area
    magnitudes = np.linalg.norm(cross_products, axis=1)
    manual_area = np.sum(magnitudes) / 2.0
    
    # Method 2: Use built-in mesh.areas
    builtin_area = my_mesh.areas.sum()
    
    # Output the results
    console.print(f"[bold green]Method 1 (Manual Cross-Product):[/bold green] [yellow]{manual_area:.4f}[/yellow] square units")
    console.print(f"[bold green]Method 2 (Built-in mesh.areas):[/bold green]  [yellow]{builtin_area:.4f}[/yellow] square units")
    
    # Check if they are close
    if np.isclose(manual_area, builtin_area):
        console.print("[green]The calculations perfectly match![/green]")
    else:
        console.print("[red]Warning: The calculations do not match.[/red]")

if __name__ == '__main__':
    app()
