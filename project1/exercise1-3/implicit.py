import numpy as np
import pyvista as pv
import typer
from enum import Enum
from pathlib import Path
from rich.console import Console
from skimage import measure
from typing_extensions import Annotated


console = Console()
app = typer.Typer(help="Visualize the box-cylinder union for exercise 1-3.")
FIGURES_DIR = Path(__file__).resolve().parent / "figures"
DEFAULT_CAMERA_POSITION = [
    (2.6, 2.2, 1.8),
    (0.0, 0.0, 0.15),
    (0.0, 0.0, 1.0),
]


class BooleanMethod(str, Enum):
    minmax = "minmax"
    rfunc = "rfunc"


@app.callback()
def main() -> None:
    pass


def r_union(field_a: np.ndarray, field_b: np.ndarray, alpha: float) -> np.ndarray:
    blend = np.clip(field_a**2 + field_b**2 - 2.0 * alpha * field_a * field_b, 0.0, None)
    return field_a + field_b + np.sqrt(blend)


def r_intersection(field_a: np.ndarray, field_b: np.ndarray, alpha: float) -> np.ndarray:
    blend = np.clip(field_a**2 + field_b**2 - 2.0 * alpha * field_a * field_b, 0.0, None)
    return field_a + field_b - np.sqrt(blend)


def minmax_union(field_a: np.ndarray, field_b: np.ndarray) -> np.ndarray:
    return np.maximum(field_a, field_b)


def minmax_intersection(field_a: np.ndarray, field_b: np.ndarray) -> np.ndarray:
    return np.minimum(field_a, field_b)


def box_field(x: np.ndarray, y: np.ndarray, z: np.ndarray) -> np.ndarray:
    return 0.5 - np.maximum(np.maximum(np.abs(x), np.abs(y)), np.abs(z))


def sphere_field(x: np.ndarray, y: np.ndarray, z: np.ndarray) -> np.ndarray:
    return 1.0 - (x**2 + y**2 + z**2)


def cylinder_field(x: np.ndarray, y: np.ndarray, z: np.ndarray, method: BooleanMethod, alpha: float) -> np.ndarray:
    radius = 0.1
    embed_depth = 0.05
    z_bottom = 0.5 - embed_depth
    z_top = 0.7

    radial_field = radius - np.sqrt(x**2 + y**2)
    above_bottom = z - z_bottom
    below_top = z_top - z
    if method is BooleanMethod.minmax:
        height_field = minmax_intersection(above_bottom, below_top)
        return minmax_intersection(radial_field, height_field)

    height_field = r_intersection(above_bottom, below_top, alpha)
    return r_intersection(radial_field, height_field, alpha)


def union_field(x: np.ndarray, y: np.ndarray, z: np.ndarray, method: BooleanMethod, alpha: float) -> np.ndarray:
    box = box_field(x, y, z)
    cylinder = cylinder_field(x, y, z, method, alpha)
    if method is BooleanMethod.minmax:
        return minmax_union(box, cylinder)
    return r_union(box, cylinder, alpha)


def metamorphosis_field(
    sphere: np.ndarray,
    box_cylinder: np.ndarray,
    mu: float,
) -> np.ndarray:
    return (1.0 - mu) * sphere + mu * box_cylinder


def build_grid(grid_min: float, grid_max: float, resolution: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    grid = np.mgrid[
        grid_min:grid_max:complex(0, resolution),
        grid_min:grid_max:complex(0, resolution),
        grid_min:grid_max:complex(0, resolution),
    ]
    return grid[0], grid[1], grid[2]


def extract_surface(
    field: np.ndarray,
    grid_min: float,
    grid_max: float,
    resolution: int,
    level: float,
) -> pv.PolyData:
    spacing = (grid_max - grid_min) / (resolution - 1)
    vertices, faces, _, _ = measure.marching_cubes(
        field,
        level=level,
        spacing=(spacing, spacing, spacing),
    )
    vertices += np.array([grid_min, grid_min, grid_min])
    pv_faces = np.column_stack((np.full(len(faces), 3), faces)).ravel()
    return pv.PolyData(vertices, pv_faces)


def render_surface(
    surface: pv.PolyData,
    title: str,
    show: bool,
    screenshot_path: Path | None = None,
) -> None:
    off_screen = screenshot_path is not None and not show
    plotter = pv.Plotter(off_screen=off_screen, window_size=(1280, 960))
    plotter.set_background("white")
    plotter.add_text(title, font_size=16, color="black")
    plotter.add_mesh(surface, color="lightblue", smooth_shading=True, show_edges=False)
    plotter.show_axes()
    plotter.camera_position = DEFAULT_CAMERA_POSITION

    if show:
        if screenshot_path is not None:
            plotter.show(screenshot=str(screenshot_path), auto_close=True)
        else:
            plotter.show()
        return

    if screenshot_path is not None:
        plotter.screenshot(str(screenshot_path))
    plotter.close()


@app.command()
def sphere(
    grid_min: Annotated[
        float,
        typer.Option("--min", help="Minimum plotting bound for x, y, and z."),
    ] = -1.5,
    grid_max: Annotated[
        float,
        typer.Option("--max", help="Maximum plotting bound for x, y, and z."),
    ] = 1.5,
    res: Annotated[
        int,
        typer.Option("--res", min=10, help="Uniform marching cubes grid resolution."),
    ] = 80,
    show: Annotated[
        bool,
        typer.Option("--show/--no-show", help="Display the PyVista window after meshing."),
    ] = True,
) -> None:
    console.print("[bold cyan]Building sphere implicit surface...[/bold cyan]")
    console.print("f(x, y, z) = 1 - (x^2 + y^2 + z^2)")
    console.print("isosurface: f(x, y, z) = 0")
    console.print(f"center = [yellow](0, 0, 0)[/yellow], radius = [yellow]1[/yellow], resolution = [yellow]{res}[/yellow]")

    x, y, z = build_grid(grid_min, grid_max, res)
    field = sphere_field(x, y, z)

    try:
        surface = extract_surface(field, grid_min, grid_max, res, level=0.0)
    except ValueError as exc:
        console.print("[bold red]Isosurface extraction failed.[/bold red]")
        console.print(str(exc))
        raise typer.Exit(code=1) from exc

    console.print(
        f"[bold green]Mesh ready:[/bold green] {surface.n_points} vertices, {surface.n_cells} faces"
    )

    if not show:
        return

    render_surface(surface, "Sphere: f(x, y, z) = 0", show=show)


@app.command()
def metamorphose(
    grid_min: Annotated[
        float,
        typer.Option("--min", help="Minimum plotting bound for x, y, and z."),
    ] = -1.5,
    grid_max: Annotated[
        float,
        typer.Option("--max", help="Maximum plotting bound for x, y, and z."),
    ] = 1.5,
    res: Annotated[
        int,
        typer.Option("--res", min=10, help="Uniform marching cubes grid resolution."),
    ] = 80,
    show: Annotated[
        bool,
        typer.Option("--show/--no-show", help="Display each metamorphosis frame while saving screenshots."),
    ] = False,
) -> None:
    console.print("[bold cyan]Building sphere-to-box-cylinder metamorphosis...[/bold cyan]")
    console.print("sphere field: f_s(x, y, z) = 1 - (x^2 + y^2 + z^2)")
    console.print("target field: f_u(x, y, z) = max(f_box(x, y, z), f_cyl(x, y, z))")
    console.print("metamorphosis: f_mu(x, y, z) = (1 - mu) f_s(x, y, z) + mu f_u(x, y, z)")
    console.print("mu_i = i / 10 for i = 0, 1, ..., 10")
    console.print(f"resolution = [yellow]{res}[/yellow]")

    FIGURES_DIR.mkdir(parents=True, exist_ok=True)
    x, y, z = build_grid(grid_min, grid_max, res)
    sphere = sphere_field(x, y, z)
    box_cylinder = union_field(x, y, z, BooleanMethod.minmax, alpha=0.5)

    for step in range(11):
        mu = step / 10.0
        field = metamorphosis_field(sphere, box_cylinder, mu)
        image_path = FIGURES_DIR / f"metamorphosis-{step:02d}.png"

        try:
            surface = extract_surface(field, grid_min, grid_max, res, level=0.0)
        except ValueError as exc:
            console.print(f"[bold red]Isosurface extraction failed at step {step} (mu={mu:.1f}).[/bold red]")
            console.print(str(exc))
            raise typer.Exit(code=1) from exc

        render_surface(
            surface,
            title=f"Metamorphosis step {step}/10 (mu = {mu:.1f})",
            show=show,
            screenshot_path=image_path,
        )
        console.print(
            f"step [yellow]{step:02d}[/yellow] | mu = [yellow]{mu:.1f}[/yellow] | "
            f"mesh = [green]{surface.n_points} vertices, {surface.n_cells} faces[/green] | "
            f"saved [blue]{image_path.name}[/blue]"
        )


@app.command()
def union(
    method: Annotated[
        BooleanMethod,
        typer.Option("--method", case_sensitive=False, help="Boolean operator: minmax or rfunc."),
    ] = BooleanMethod.rfunc,
    alpha: Annotated[
        float,
        typer.Option("--alpha", min=0.0, max=1.0, help="R-function alpha parameter in [0, 1]."),
    ] = 0.5,
    grid_min: Annotated[
        float,
        typer.Option("--min", help="Minimum plotting bound for x, y, and z."),
    ] = -0.75,
    grid_max: Annotated[
        float,
        typer.Option("--max", help="Maximum plotting bound for x, y, and z."),
    ] = 0.9,
    res: Annotated[
        int,
        typer.Option("--res", min=10, help="Uniform marching cubes grid resolution."),
    ] = 60,
    show: Annotated[
        bool,
        typer.Option("--show/--no-show", help="Display the PyVista window after meshing."),
    ] = True,
) -> None:
    if method is BooleanMethod.minmax:
        console.print("[bold cyan]Building box-cylinder union with min/max Boolean composition...[/bold cyan]")
        console.print(f"resolution = [yellow]{res}[/yellow]")
    else:
        console.print("[bold cyan]Building box-cylinder union with R-functions...[/bold cyan]")
        console.print(f"alpha = [yellow]{alpha:.3f}[/yellow], resolution = [yellow]{res}[/yellow]")

    x, y, z = build_grid(grid_min, grid_max, res)
    field = union_field(x, y, z, method, alpha)

    try:
        surface = extract_surface(field, grid_min, grid_max, res, level=-0.01)
    except ValueError as exc:
        console.print("[bold red]Isosurface extraction failed.[/bold red]")
        console.print(str(exc))
        raise typer.Exit(code=1) from exc

    console.print(
        f"[bold green]Mesh ready:[/bold green] {surface.n_points} vertices, {surface.n_cells} faces"
    )

    if not show:
        return

    render_surface(surface, f"Union: {method.value}", show=show)


if __name__ == "__main__":
    app()