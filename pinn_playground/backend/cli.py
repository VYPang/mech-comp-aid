#!/usr/bin/env python3
"""
Typer + Rich CLI for the PINN Playground backend.

Run from the repository root, for example::

    uv run python pinn_playground/backend/cli.py serve --port 8000

Or as a module (if the repo root is on ``PYTHONPATH``)::

    uv run python -m pinn_playground.backend.cli serve --port 8000
"""

from __future__ import annotations

import sys
from pathlib import Path

# Allow ``python pinn_playground/backend/cli.py`` without installing the package.
_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

import typer
import uvicorn
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

app = typer.Typer(
    name="pinn-playground",
    help="PINN Playground — backend server and tools.",
    no_args_is_help=True,
)
console = Console()


@app.command("version")
def version_cmd() -> None:
    """Print backend package version string."""
    console.print("[bold]PINN Playground[/bold] backend [cyan]0.1.0[/cyan]")


@app.command("serve")
def serve(
    host: str = typer.Option("127.0.0.1", "--host", help="Interface to bind."),
    port: int = typer.Option(8000, "--port", "-p", help="TCP port."),
    reload: bool = typer.Option(False, "--reload", help="Reload on code changes (development)."),
    log_level: str = typer.Option(
        "info",
        "--log-level",
        help="Uvicorn log level (critical, error, warning, info, debug, trace).",
    ),
) -> None:
    """Start the FastAPI + Uvicorn server."""
    table = Table(show_header=False, box=None, padding=(0, 1))
    table.add_row("Host", host)
    table.add_row("Port", str(port))
    table.add_row("Reload", str(reload))
    table.add_row("Log level", log_level)
    table.add_row("App", "pinn_playground.backend.main:app")

    console.print(
        Panel(
            table,
            title="[bold green]PINN Playground[/bold green]",
            subtitle="Starting Uvicorn…",
            border_style="green",
        )
    )

    uvicorn.run(
        "pinn_playground.backend.main:app",
        host=host,
        port=port,
        reload=reload,
        log_level=log_level.lower(),
    )


def main() -> None:
    app()


if __name__ == "__main__":
    main()
