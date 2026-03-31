# PINN Playground Handoff

This document summarizes what has been built so far in `pinn_playground/` and what the next agent should know before continuing development.

## Project Goal

`PINN Playground` is an interactive educational web app for Mechanical Engineering students to explore Physics-Informed Neural Networks (PINNs) on a lightweight 2D linear elasticity problem.

The intended student experience is:

- change geometry and PINN settings from the browser
- compare a base frame, a diagonal brace, and an X-brace
- preview collocation points before training
- stream live losses and Von Mises stress during training
- receive guide-box hints when choices are likely to help or hurt training

## Current Status

The project is no longer just a scaffold. It now includes:

- a working FastAPI backend
- a `typer` + `rich` CLI runner
- a browser dashboard served from FastAPI static files
- live preview of collocation points
- WebSocket-based training sessions
- Plotly visualizations for:
  - collocation points
  - Von Mises stress
  - training curves
- a rule-based "Professor Assistant" hint panel

Recent UI changes:

- `Collocation Points` and `Von Mises Stress` are side-by-side
- `Training Curves` is below them
- parameter controls are grouped into collapsible toggle sections

Recent bug fixes:

- added `websockets` dependency so Uvicorn can serve `/ws/train`
- fixed the loss curve update bug by avoiding in-place mutation of Plotly data arrays in `frontend/app.js`

## File Architecture

```text
pinn_playground/
  AGENT.md                    # this handoff file
  __init__.py
  backend/
    __init__.py
    cli.py                    # Typer + Rich CLI to launch server
    main.py                   # FastAPI app, preview endpoint, websocket endpoint, static mount
    training.py               # training config, preview payloads, training loop, BC loss
    pinn_model.py             # PINN MLP and Von Mises grid helper
    physics_env.py            # geometry, sampling, boundary points, PDE residual helpers
  frontend/
    index.html                # dashboard layout
    app.js                    # controls, fetch preview, websocket client, Plotly updates, hints
    style.css                 # small custom styles for dashboard/toggles
```

## Coding Framework / Stack

### Backend

- Python 3.11+
- FastAPI
- Uvicorn
- PyTorch
- Typer
- Rich
- NumPy

### Frontend

- vanilla JavaScript
- HTML
- TailwindCSS via CDN
- Plotly.js via CDN

### Dependency Notes

The root `pyproject.toml` currently includes:

- `fastapi`
- `uvicorn`
- `torch`
- `typer`
- `rich`
- `websockets`

`websockets` is required for Uvicorn to accept browser WebSocket upgrades.

## Runtime Flow

### Server startup

Run from repo root:

```bash
uv sync
uv run python pinn_playground/backend/cli.py serve --port 8000
```

Then open:

```text
http://127.0.0.1:8000/
```

### Browser data flow

1. `frontend/index.html` loads the dashboard shell.
2. `frontend/app.js` initializes Plotly charts.
3. UI control changes trigger `POST /api/preview-points`.
4. Clicking `Start Training` opens `ws://.../ws/train`.
5. The browser sends:

```json
{ "type": "start", "payload": { ...config... } }
```

6. The backend streams messages such as:

- `session`
- `preview`
- `metrics`
- `complete`
- `error`

7. `frontend/app.js` updates:

- collocation scatter
- stress heatmap
- training curves
- guide box text

## Backend Details

### `backend/physics_env.py`

Current responsibilities:

- defines the normalized domain
  - outer square `[0,1] x [0,1]`
  - centered square hole
- supports three geometries:
  - `base`
  - `diagonal`
  - `x_brace`
- generates domain points:
  - `uniform`
  - `adaptive`
- generates boundary points with normals
- computes:
  - strains via autograd
  - plane-stress constitutive terms
  - equilibrium residuals
  - Von Mises stress
  - PDE loss

### Adaptive sampling

Adaptive sampling is currently heuristic, not residual-based:

- generate a large candidate pool inside the domain
- compute distance to hotspot locations
- assign weight `1 / (d + floor)^power`
- sample without replacement using the weights

Hotspots are mainly:

- the four inner-hole corners
- brace region emphasis for reinforced geometries

### `backend/pinn_model.py`

Current PINN:

- MLP
- input: `(x, y)`
- output: `(u, v)` displacement
- `tanh` activations
- optional input normalization to `[-1, 1]`

Also provides:

- parameter count helper
- `von_mises_grid()` for Plotly-ready heatmap data

### `backend/training.py`

This is the core training/session module.

Current responsibilities:

- defines `TrainingConfig` (Pydantic model)
- builds preview payloads for the frontend
- builds the PINN and optimizer
- runs the training loop
- computes total loss:
  - PDE loss
  - BC loss
- streams periodic metrics and stress grid snapshots to the browser

### Current boundary conditions

This is important for future work:

- left outer edge is clamped:
  - `u = 0`
  - `v = 0`
- right outer edge is given a prescribed horizontal displacement:
  - `u = load_displacement`
  - weak penalty on `v = 0`
- top edge, bottom edge, inner-hole boundary, and brace surfaces are traction-free

This means the current problem is **displacement-controlled**, not explicit traction/force-controlled.

### Where loading is applied

There is currently **no explicit force term**.

Instead, the structure is driven by a prescribed displacement on the **right outer boundary**, so the frame is effectively pulled from the right side in the positive `x` direction.

### `backend/main.py`

Current API surface:

- `GET /health`
- `POST /api/preview-points`
- `WS /ws/train`

Important implementation constraint:

- API routes must be declared before the static mount on `/`

### `backend/cli.py`

Provides:

- `serve`
- `version`

Uses:

- `typer`
- `rich`
- `uvicorn.run("pinn_playground.backend.main:app", ...)`

## Frontend Details

### `frontend/index.html`

Dashboard sections currently include:

- header / server status
- collapsible parameter groups
- collocation plot
- Von Mises stress plot
- training curves
- Professor Assistant panel

### `frontend/app.js`

Current responsibilities:

- gathers UI config
- updates slider labels
- requests preview data from `/api/preview-points`
- opens/closes WebSocket connections
- sends `start` / `stop`
- handles `session`, `preview`, `metrics`, `complete`, `error`
- updates Plotly plots
- generates guide-box text from simple rules

Important bug fix already applied:

- `appendLoss()` rebuilds arrays immutably before calling `Plotly.react()`
- this avoids the issue where only the first point appeared on the loss curve

### `frontend/style.css`

Only small custom styling is used here:

- input styles
- plot panel height
- collapsible toggle panel styles
- guide-box emphasis

## Known Behavior / Constraints

- The app is currently single-session in spirit, though each WebSocket connection creates its own model run.
- Training is intentionally lightweight and educational, not mechanically rigorous.
- Stress updates are streamed every `update_every` epochs, default `50`.
- Stress grid size is intentionally modest for browser responsiveness.
- The guide box is rule-based and not yet tied to deeper training diagnostics.

## What Has Been Done Across The Conversation

1. Created the `pinn_playground/` package structure from scratch.
2. Added backend dependencies for FastAPI, Uvicorn, Torch, and later `websockets`.
3. Implemented the 2D frame geometry, brace variants, adaptive sampling, PDE residuals, and Von Mises computation.
4. Implemented the PINN MLP with optional input normalization.
5. Added a FastAPI app and Typer CLI.
6. Added an initial static landing page so `/` would no longer 404.
7. Replaced the landing page with the actual dashboard.
8. Added `/api/preview-points`.
9. Added `WS /ws/train`.
10. Added the training session module with BC loss and streamed metrics.
11. Fixed missing WebSocket transport by adding `websockets`.
12. Fixed the Plotly training-curve bug caused by in-place array mutation.
13. Updated the layout to:
    - side-by-side collocation and stress plots
    - training curve below
    - toggle-based control sections
14. Explained the current boundary conditions and loading model.

## Recommended Next Steps

These are the most logical continuation points for the next agent:

- improve the mechanics model for teaching clarity
  - optionally switch from prescribed displacement to explicit traction loading
  - make the loading visualization clearer in the UI
- improve the "Professor Assistant"
  - include hints based on loss trends, not just static settings
  - explicitly explain boundary conditions and reinforcement effects
- improve comparison workflow
  - save last run summary
  - compare `base` vs `diagonal` vs `x_brace`
- add more training diagnostics
  - elapsed time
  - parameter count
  - device indicator
  - peak stress summary
- make the frontend more robust
  - clearer training states
  - better WebSocket error handling
  - optional caching / reset behavior
- consider reducing duplicated preview requests when controls are changed rapidly

## Practical Notes For The Next Agent

- Use `uv run python pinn_playground/backend/cli.py serve --port 8000` from repo root.
- If the browser seems stale after JS/CSS changes, hard refresh.
- If WebSockets fail again, confirm the server was restarted after dependency changes.
- Keep route declarations above the static mount in `backend/main.py`.
- If you touch Plotly update logic, be careful with in-place mutation of arrays.
- The current implementation is intentionally simple and educational; do not assume it is a production mechanics solver.
