# Coding Standards & Guidelines

This document outlines the primary development standards and best practices established for maintaining the codebase in this project.

## 1. Command Line Interfaces (CLI)

*   **Rule:** Use **`typer`** for all command-line parsing.
*   **Reasoning:** `typer` relies on Python's standard type hints to automatically build interfaces and generate help documentation. This reduces boilerplate compared to `argparse` and guarantees strict type validation for user inputs.
*   **Best Practice:** Use strictly typed `Enum` classes (e.g., `class ModelOption(str, Enum)`) for inputs that have a predefined set of choices to ensure the user cannot provide invalid arguments.

## 2. Terminal Output Formatting

*   **Rule:** Use the **`rich`** library (`rich.console.Console`) for standard output.
*   **Reasoning:** `rich` provides an aesthetically pleasing user experience through syntax coloring, stylized text, and well-structured output blocks. It drastically improves terminal readability.
*   **Best Practice:**
    *   Initialize a global console instance: `console = Console()`
    *   Avoid using the standard `print()` statement. Always use `console.print()`.
    *   Use brackets for color and style tags (e.g., `[cyan]Status update...[/cyan]`, `[bold green]Success![/bold green]`).

## 3. Dependency & Environment Management

*   **Rule:** Use **`uv`** for dependency resolution and virtual environment tracking.
*   **Reasoning:** `uv` is exceptionally fast, combines `pip`, `venv`, and `pip-tools` into a single binary, and handles lockfiles (`uv.lock`) naturally.
*   **Best Practice:** Always perform installations via `uv add <package>` to maintain synchronization with your `pyproject.toml` and `.venv`. Other developers should recreate the environment utilizing `uv sync`.

## 4. Mathematical Operations

*   **Rule:** Leverage **NumPy Vectorization** for large computational operations.
*   **Reasoning:** When looping over thousands (or millions) of discrete data points (like iterating over STL face vertices to compute geometries), standard Python `for` loops act as a critical bottleneck. NumPy performs these operations iteratively within C-level extensions.
*   **Best Practice:** Whenever calculating things like distance, cross products, or linear algebra on meshes, convert your data to vectorized formats `(N, M)` and perform operations directly across entire axes mathematically. For example, compute the areas of all faces simultaneously via `np.cross(edge1, edge2)`.

## 5. Directory Referencing

*   **Rule:** Avoid hardcoded absolute file paths.
*   **Reasoning:** The application should function universally regardless of what directory the user's terminal is currently inside, or what local machine they are targeting.
*   **Best Practice:** Always derive file paths dynamically related to the current script file using `os.path.dirname(os.path.abspath(__file__))`.

## 6. Git Commit Messages

*   **Rule:** Use **Conventional Commits** formatting for all generated commit messages.
*   **Reasoning:** Standardizing commit messages helps maintain a clean, readable summary of codebase evolution and clarifies the intent of each change.
*   **Best Practice:** Always prefix the commit message with an appropriate type tag, such as `feat:` (new feature), `fix:` (bug fix), `refactor:` (code restructuring), `docs:` (documentation), or `chore:` (routine tasks). Example: `feat: add new user instructions`.
