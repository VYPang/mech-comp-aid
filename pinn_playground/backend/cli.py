#!/usr/bin/env python3
"""
Typer + Rich CLI for the PINN Playground backend.

Run from the repository root, for example::

    uv run python pinn_playground/backend/cli.py serve --port 8000

Or as a module (if the repo root is on ``PYTHONPATH``)::

    uv run python -m pinn_playground.backend.cli serve --port 8000
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

# Allow ``python pinn_playground/backend/cli.py`` without installing the package.
_REPO_ROOT = Path(__file__).resolve().parents[2]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

import typer
import uvicorn
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from pinn_playground.backend.diagnostics import WebUIDiagnosticsRequest, evaluate_webui_state

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


@app.command("diagnose")
def diagnose(
    input_path: Path | None = typer.Option(
        None,
        "--input",
        "-i",
        exists=True,
        dir_okay=False,
        readable=True,
        help="Optional JSON diagnostics request. Defaults to the standard teaching case.",
    ),
    fem_solve: bool = typer.Option(False, "--fem-solve", help="Also run the FEM solve during diagnostics."),
    stress_grid_n: int = typer.Option(40, "--stress-grid-n", min=16, max=120, help="Stress grid size for optional solves."),
    json_output: bool = typer.Option(False, "--json", help="Print the full diagnostics response as JSON."),
) -> None:
    """Run backend diagnostics from a structured WebUI-like state snapshot."""
    payload: dict[str, Any] = {}
    if input_path is not None:
        payload = json.loads(input_path.read_text())

    request = WebUIDiagnosticsRequest.model_validate(payload)
    request.run.fem_solve = request.run.fem_solve or fem_solve
    request.run.stress_grid_n = stress_grid_n
    result = evaluate_webui_state(request)

    if json_output:
        console.print_json(data=result)
        return

    console.print(Panel.fit("Backend diagnostics completed", title="PINN Playground", border_style="cyan"))

    case_table = Table(title="Case IDs")
    case_table.add_column("Scope", style="cyan")
    case_table.add_column("ID", style="white")
    for scope, case_id in result["case_ids"].items():
        case_table.add_row(scope, str(case_id))
    console.print(case_table)

    finding_table = Table(title="Findings")
    finding_table.add_column("Severity", style="bold")
    finding_table.add_column("Code", style="cyan")
    finding_table.add_column("Target", style="magenta")
    finding_table.add_column("Message", style="white")
    for finding in result["findings"]:
        finding_table.add_row(
            finding["severity"],
            finding["code"],
            finding.get("target") or "",
            finding["message"],
        )
    console.print(finding_table)

    output_table = Table(title="Computation Outputs")
    output_table.add_column("Step", style="cyan")
    output_table.add_column("Status", style="bold")
    output_table.add_column("Summary", style="white")
    for step, output in result["outputs"].items():
        output_table.add_row(step, output.get("status", "unknown"), _summarize_output(output))
    console.print(output_table)


def _summarize_output(output: dict[str, Any]) -> str:
    if output.get("status") == "error":
        return str(output.get("message", "unknown error"))
    if "mesh_counts" in output:
        counts = output["mesh_counts"]
        return f"{counts.get('n_nodes')} nodes, {counts.get('n_elements')} elements"
    if "counts" in output:
        return json.dumps(output["counts"], sort_keys=True)
    if "summary" in output:
        summary = output["summary"]
        return f"max VM {summary.get('max_von_mises'):.4g}, max disp {summary.get('max_displacement'):.4g}"
    return "ok"


def main() -> None:
    app()


if __name__ == "__main__":
    main()
