import numpy as np
import typer
from enum import Enum
from rich.console import Console
from typing_extensions import Annotated
from skimage import measure
import pyvista as pv

console = Console()
app = typer.Typer(help="Calculate periodic surfaces (P, D, G).")

class SurfaceType(str, Enum):
    P = "P"
    D = "D"
    G = "G"

SURFACE_PARAMS = {
    SurfaceType.P: {
        "mu": np.array([1, 1, 1], dtype=float),
        "p_matrix": np.array([
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1],
            [0, 0, 0]
        ], dtype=float)
    },
    SurfaceType.D: {
        "mu": np.array([1, 1, 1, 1, -1, 1, 1, -1], dtype=float),
        "p_matrix": np.array([
            [ 1,  1,  1,  1, -1,  1,  1, -1],
            [ 1, -1, -1,  1,  1, -1, -1, -1],
            [-1,  1, -1,  1, -1,  1, -1,  1],
            [ 0,  0,  0,  0, 0.25, 0.25, 0.25, 0.25]
        ], dtype=float)
    },
    SurfaceType.G: {
        "mu": np.array([1, 1, 1, 1, 1, -1], dtype=float),
        "p_matrix": np.array([
            [-1, -1,  0,  0, -1, -1],
            [-1,  1, -1, -1,  0,  0],
            [ 0,  0, -1,  1, -1,  1],
            [0.25, 0.25, 0.25, 0.25, 0.25, 0.25]
        ], dtype=float)
    }
}

def calculate_psi(r: np.ndarray, mu: np.ndarray, p_matrix: np.ndarray, kappa: float = 1.0) -> np.ndarray:
    """
    Computes the value of the periodic surface function psi(r).
    
    Args:
        r: Homogeneous coordinate(s) as numpy array [x, y, z, 1]. Can be shape (4,) or (N, 4).
        mu: Periodic moment vector.
        p_matrix: Matrix of basis vectors (columns).
        kappa: Global scale parameter.
        
    Returns:
        The evaluated psi value(s) as a scalar or 1D array of shape (N,).
    """
    # r is shape (..., 4), p_matrix is shape (4, M)
    # The dot product r @ p_matrix results in shape (..., M)
    # Each entry along M corresponds to p_m^T * r
    inner_term = 2 * np.pi * kappa * (r @ p_matrix)
    
    # Calculate the cosine over the elements
    cos_term = np.cos(inner_term)
    
    # Multiply by mu and sum over the M axis (last axis)
    psi = np.sum(mu * cos_term, axis=-1)
    
    return psi

@app.command()
def evaluate(
    surface: Annotated[SurfaceType, typer.Argument(help="Type of the periodic surface (P, D, or G)")],
    x: Annotated[float, typer.Option("--x", "-x", help="X coordinate")] = 0.0,
    y: Annotated[float, typer.Option("--y", "-y", help="Y coordinate")] = 0.0,
    z: Annotated[float, typer.Option("--z", "-z", help="Z coordinate")] = 0.0,
    kappa: Annotated[float, typer.Option("--kappa", "-k", help="Global scale parameter kappa")] = 1.0,
):
    """
    Evaluate the implicit function psi(r) for a selected periodic surface type at a given point (x, y, z).
    """
    console.print(f"[bold cyan]Evaluating Surface {surface.value}...[/bold cyan]")
    
    params = SURFACE_PARAMS[surface]
    mu = params["mu"]
    p_matrix = params["p_matrix"]
    
    # Pack into an appropriate homogeneous vector shape structure [x, y, z, 1]
    r = np.array([x, y, z, 1.0])
    
    psi_value = calculate_psi(r, mu, p_matrix, kappa)
    
    console.print(f"Point (x, y, z): [magenta]({x}, {y}, {z})[/magenta]")
    console.print(f"Global scale kappa: [magenta]{kappa}[/magenta]")
    console.print(f"[bold green]Result psi:[/bold green] [yellow]{psi_value:.6f}[/yellow]")

@app.command()
def plot(
    surface: Annotated[SurfaceType, typer.Argument(help="Type of the periodic surface (P, D, or G)")],
    kappa: Annotated[float, typer.Option("--kappa", "-k", help="Global scale parameter kappa")] = 1.0,
    grid_min: Annotated[float, typer.Option("--min", help="Minimum grid coordinate")] = -4.0,
    grid_max: Annotated[float, typer.Option("--max", help="Maximum grid coordinate")] = 4.0,
    resolution: Annotated[int, typer.Option("--res", help="Grid resolution")] = 50,
):
    """
    Plot the periodic surface via Marching Cubes and PyVista using implicit surface logic.
    """
    console.print(f"[bold cyan]Plotting Surface '{surface.value}'...[/bold cyan]")
    
    params = SURFACE_PARAMS[surface]
    mu = params["mu"]
    p_matrix = params["p_matrix"]
    
    # 1. Create 3D grid setup
    complex_res = complex(0, resolution)
    x, y, z = np.mgrid[grid_min:grid_max:complex_res, grid_min:grid_max:complex_res, grid_min:grid_max:complex_res]
    
    # Pack points into shape (..., 4) for homogenous coordinates
    r_points = np.stack((x, y, z, np.ones_like(x)), axis=-1)
    
    # 2. Evaluate the implicit function
    console.print(f"Evaluating function on a {resolution}x{resolution}x{resolution} grid...")
    psi_grid = calculate_psi(r_points, mu, p_matrix, kappa)
    
    # 3. Visualizing implicit function via marching cubes
    console.print("Extracting isosurface...")
    try:
        spacing_val = (grid_max - grid_min) / (resolution - 1)
        verts, faces, normals, values = measure.marching_cubes(
            psi_grid, 
            level=0.0, 
            spacing=(spacing_val, spacing_val, spacing_val)
        )
    except ValueError as e:
        console.print("[bold red]Extraction failed (isosurface not found).[/bold red]")
        console.print(str(e))
        raise typer.Exit(1)
        
    # Translate vertices to their genuine coordinate locations
    verts += np.array([grid_min, grid_min, grid_min])
    
    # Format faces to be read by PyVista (Requires prepended face vector length: 3)
    pv_faces = np.column_stack((np.full(len(faces), 3), faces)).ravel()
    
    # Plot using PyVista PolyData
    polydata = pv.PolyData(verts, pv_faces)
    console.print(f"[bold green]Displaying {surface.value} mesh ({len(verts)} vertices, {len(faces)} faces)...[/bold green]")
    
    plotter = pv.Plotter()
    plotter.add_mesh(polydata, color='lightblue', show_edges=False, smooth_shading=True)
    plotter.show()


if __name__ == "__main__":
    app()
