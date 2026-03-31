import numpy as np
import typer
from rich.console import Console
from rich.panel import Panel
from skimage import measure
import pyvista as pv
from enum import Enum

app = typer.Typer(help="Implicit Surface Modeling CLI for Exercise 1-3")
console = Console()

class BooleanMethod(str, Enum):
    minmax = "minmax"
    rfunc = "rfunc"

def create_grid(res: int = 100, bound: float = 1.5):
    """Generates a 3D coordinate grid."""
    # We use mgrid from -bound to bound with 'res' steps
    x, y, z = np.mgrid[-bound:bound:res*1j, -bound:bound:res*1j, -bound:bound:res*1j]
    return x, y, z, bound, res

def extract_mesh(F, bound, res):
    """Extracts a PyVista PolyData isosurface from a 3D scalar field F = 0."""
    spacing = 2 * bound / (res - 1)
    # measure.marching_cubes returns faces as (N, 3) geometry
    verts, faces, normals, values = measure.marching_cubes(F, 0, spacing=(spacing, spacing, spacing))
    
    # marching_cubes returns vertices relative to (0,0,0) index grid.
    # We need to shift it down by bound to center origin at real (0,0,0)
    verts = verts - bound 
    
    # Format faces for pyvista: [n, v1, v2, v3, n, v1, v2, v3...]
    # where n is the number of vertices per face (always 3 for marching cubes)
    pv_faces = np.hstack([np.full((len(faces), 1), 3), faces]).flatten()
    return pv.PolyData(verts, pv_faces)

def f_sphere(x, y, z):
    """Implicit function for a sphere centered at origin, r=1."""
    return x**2 + y**2 + z**2 - 1.0

def f_box(x, y, z):
    """Implicit function for a 1x1x1 box centered at origin."""
    return np.maximum(np.maximum(np.abs(x) - 0.5, np.abs(y) - 0.5), np.abs(z) - 0.5)

def f_cylinder(x, y, z):
    """Implicit function for a cylinder aligned with z-axis. radius=0.1, height=0.2 centered at z=0.6"""
    return np.maximum(x**2 + y**2 - 0.1**2, np.abs(z - 0.6) - 0.1)

def r_min(a, b, alpha=0.5):
    """R-function for smooth minimum (Union logic for interior F < 0)."""
    return a + b - np.sqrt(a**2 + b**2 - 2 * alpha * a * b)

@app.command()
def sphere():
    """(1) Visualize a sphere centered at (0,0,0) with radius of 1."""
    console.print(Panel("[bold cyan]Formulation:[/bold cyan]\nF(x,y,z) = x² + y² + z² - 1", title="Sphere", expand=False))
    
    with console.status("[bold green]Computing 3D grid and scalar field..."):
        x, y, z, bound, res = create_grid()
        F = f_sphere(x, y, z)
        mesh = extract_mesh(F, bound, res)
        
    plotter = pv.Plotter()
    plotter.add_mesh(mesh, color='lightblue', smooth_shading=True)
    plotter.add_axes()
    console.print("[green]Rendering Sphere... Close the window inside PyVista to exit.[/green]")
    plotter.show()

@app.command()
def union(
    method: BooleanMethod = typer.Option(BooleanMethod.minmax, help="Boolean method (minmax or rfunc)"),
    alpha: float = typer.Option(0.5, help="Alpha parameter for R-functions (blending smoothness)")
):
    """(2) Visualize the union of a box and a cylinder."""
    if method == BooleanMethod.minmax:
        console.print(Panel("[bold cyan]Formulation (Min/Max):[/bold cyan]\nF_box = max(|x|-0.5, |y|-0.5, |z|-0.5)\nF_cyl = max(x² + y² - 0.1², |z - 0.6| - 0.1)\nF_union = min(F_box, F_cyl)", title="Box-Cylinder Union", expand=False))
    else:
        console.print(Panel(f"[bold cyan]Formulation (R-function):[/bold cyan]\nF_box = max(|x|-0.5, |y|-0.5, |z|-0.5)\nF_cyl = max(x² + y² - 0.1², |z - 0.6| - 0.1)\nF_union = F_box + F_cyl - sqrt(F_box² + F_cyl² - 2*alpha*F_box*F_cyl)  (alpha={alpha})", title="Box-Cylinder Union", expand=False))

    with console.status(f"[bold green]Computing Boolean Union ({method.value})..."):
        x, y, z, bound, res = create_grid()
        F_b = f_box(x, y, z)
        F_c = f_cylinder(x, y, z)
        
        if method == BooleanMethod.minmax:
            F = np.minimum(F_b, F_c)
        else:
            F = r_min(F_b, F_c, alpha=alpha)
            
        mesh = extract_mesh(F, bound, res)
        
    plotter = pv.Plotter()
    plotter.add_mesh(mesh, color='lightblue', smooth_shading=True)
    plotter.add_axes()
    console.print(f"[green]Rendering Union ({method.value})... Close the window inside PyVista to exit.[/green]")
    plotter.show()

@app.command()
def metamorphose():
    """(3) Generate metamorphosis between the sphere and the box-cylinder."""
    console.print(Panel("[bold cyan]Formulation:[/bold cyan]\nF_union = min(F_box, F_cyl)\nF_sphere = x² + y² + z² - 1\nF_meta = μ * F_union + (1 - μ) * F_sphere\nFor μ in [0, 1] with 11 steps.", title="Metamorphosis", expand=False))
    
    with console.status("[bold green]Precomputing primitive geometries..."):
        x, y, z, bound, res = create_grid()
        F_s = f_sphere(x, y, z)
        F_b = f_box(x, y, z)
        F_c = f_cylinder(x, y, z)
        F_u = np.minimum(F_b, F_c)
    
    # 10 linear steps = 11 images
    mu_values = np.linspace(0, 1, 11)
    
    for i, mu in enumerate(mu_values):
        console.print(f"[cyan]Rendering step {i+1}/11 -> μ = {mu:.1f}[/cyan] (Capture screenshot, then close window to proceed)")
        
        F_meta = mu * F_u + (1 - mu) * F_s
        mesh = extract_mesh(F_meta, bound, res)
        
        plotter = pv.Plotter()
        plotter.add_mesh(mesh, color='lightblue', smooth_shading=True)
        plotter.add_axes()
        plotter.add_text(f"Metamorphosis Step {i+1}/11\nmu = {mu:.1f}", position='upper_left', font_size=12)
        plotter.show()
        
    console.print("[bold green]Metamorphosis sequence completed![/bold green]")

if __name__ == "__main__":
    app()
