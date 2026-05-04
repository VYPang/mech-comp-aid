"""FastAPI application entry point for PINN Playground."""

from __future__ import annotations

import asyncio
from contextlib import suppress
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles

from pinn_playground.backend.fem_geometry import build_fem_preview_payload
from pinn_playground.backend.fem_solver import solve_fem_problem
from pinn_playground.backend.problem_definition import FEMProblemConfig
from pinn_playground.backend.training import (
    TrainingConfig,
    build_preview_payload,
    build_teacher_preview_payload,
    stream_training_session,
)

# API routes must be registered before the catch-all static mount on "/".
app = FastAPI(
    title="PINN Playground",
    description="Educational API for Physics-Informed Neural Networks (PINNs).",
    version="0.1.0",
)


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness check for load balancers and local dev."""
    return {"status": "ok"}


@app.post("/api/preview-points")
def preview_points(config: TrainingConfig) -> dict[str, object]:
    """Return plot-friendly collocation and boundary points for the current UI state."""
    return build_preview_payload(config)


@app.post("/api/teacher-preview")
def teacher_preview(config: TrainingConfig) -> dict[str, object]:
    """Return teacher-point coordinates grouped by category for the overlay plot."""
    return build_teacher_preview_payload(config)


@app.post("/api/fem/preview")
def fem_preview(config: FEMProblemConfig) -> dict[str, object]:
    """Return mesh and boundary-preview data for the numerical-method playground."""
    return build_fem_preview_payload(config)


@app.post("/api/fem/solve")
def fem_solve(config: FEMProblemConfig) -> dict[str, object]:
    """Run a static FEM solve and return deformed-mesh and stress results."""
    return solve_fem_problem(config)


@app.websocket("/ws/train")
async def websocket_train(websocket: WebSocket) -> None:
    """Accept one training session per websocket connection."""
    await websocket.accept()
    cancel_event = asyncio.Event()
    training_task: asyncio.Task[None] | None = None

    try:
        while True:
            message = await websocket.receive_json()
            message_type = message.get("type", "start")

            if message_type == "start":
                if training_task and not training_task.done():
                    await websocket.send_json(
                        {
                            "type": "error",
                            "message": "Training is already running for this connection.",
                        }
                    )
                    continue
                cancel_event = asyncio.Event()
                payload = message.get("payload", message)
                config = TrainingConfig.model_validate(payload)
                training_task = asyncio.create_task(
                    stream_training_session(websocket, config, cancel_event)
                )
                continue

            if message_type == "stop":
                cancel_event.set()
                if training_task:
                    with suppress(Exception):
                        await training_task
                return

            await websocket.send_json(
                {
                    "type": "error",
                    "message": "Unsupported websocket message. Use 'start' or 'stop'.",
                }
            )
    except WebSocketDisconnect:
        cancel_event.set()
        if training_task:
            with suppress(Exception):
                await training_task


_frontend_dir = Path(__file__).resolve().parent.parent / "frontend"
if _frontend_dir.is_dir():
    app.mount(
        "/",
        StaticFiles(directory=str(_frontend_dir), html=True),
        name="frontend",
    )
