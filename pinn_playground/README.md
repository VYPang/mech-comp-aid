# PINN Playground

`PINN Playground` is an interactive educational web application for exploring Physics-Informed Neural Networks on a small 2D linear-elasticity metal-frame problem. The app combines a numerical baseline, a tutorial sequence, a PINN training workspace, and a local AI tutor so students can move from mechanics intuition to PINN behavior inside one interface.

## Quick Start

This project now assumes a local Qwen model for the tutor. The shortest working setup is:

1. install `uv` and Python 3.11+,
2. install Ollama,
3. sync the Python environment,
4. pull `qwen3.6:27b`,
5. start the backend server,
6. open the browser UI.

### 1. Install system prerequisites

Required:


If `uv` is not installed yet:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

If Ollama is not installed yet, follow the platform-specific instructions from the Ollama project, then confirm it is available:

```bash
ollama --version
```

### 2. Install Python dependencies

From the repository root, create the environment and install the project dependencies:

```bash
uv sync
```

This installs the dependencies declared in the root `pyproject.toml`, including:


`websockets` is required so Uvicorn can accept the browser training socket at `/ws/train`.

### 3. Download the local Qwen model for the tutor

Pull the model used by the tutor harness:

```bash
ollama pull qwen3.6:27b
```

The tutor is currently configured to work with OpenAI-compatible local endpoints and will auto-detect supported Qwen models from Ollama. The model validated during development was:


If Ollama is not already running as a background service on your machine, start it in another terminal:

```bash
ollama serve
```

### 4. Start the PINN Playground server

From the repository root:

```bash
uv run python pinn_playground/backend/cli.py serve --port 8000
```

Then open:

```text
http://127.0.0.1:8000/
```

### 5. Optional health checks

You can verify the backend and tutor model status with:

```bash
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:8000/api/tutor/status
```

If the tutor is ready, the status response should report the selected local model and `ready: true`.

## Problem Statement

The teaching problem is a simplified 2D plane-stress metal frame. The goal is not to produce a production-grade structural solver. The goal is to provide a compact mechanics problem on which students can compare a classical numerical baseline against a PINN approximation.

### Geometry

The domain is a square outer frame with a centered square hole. The student can switch between three reinforcement layouts:

- `base`: no brace across the opening,
- `diagonal`: one diagonal brace,
- `x_brace`: two crossing braces.

This gives three related structural cases with visibly different load paths and stress concentrations.

### Material model

The current mechanics model is small-strain linear elasticity in plane stress. The PINN predicts the displacement field:

$$
(x, y) \mapsto (u(x, y), v(x, y))
$$

From that field, the application computes strain, stress, equilibrium residuals, and Von Mises stress for visualization and comparison.

### Loading and boundary conditions

The boundary conditions are deliberately aligned between the FEM baseline and the PINN teaching case.

- The bottom outer edge is fully clamped, so both displacement components are fixed:

$$
u = 0, \quad v = 0
$$

- The load is applied on a patch of the top outer boundary. By default, that patch is centered at $x = 0.50$ and has width $0.20$, so the default loaded interval is:

$$
x \in [0.40, 0.60], \quad y = 1.0
$$

- The default traction vector is purely vertical and downward:

$$
\sigma \cdot n = [t_x, t_y] = [0, -1]
$$

- That means the default horizontal traction is zero and the default vertical traction has magnitude $1.0$ in the negative $y$-direction.

- The remaining outer boundary, the hole boundary, and brace surfaces are traction-free.

In the current teaching setup, this is best read as a normalized reference load case rather than a calibrated real-world engineering load. The patch location and width are user-controlled, but the default direction is vertically downward with unit magnitude.

## Runtime Overview

The application has three main interactive paths.

### 1. Numerical path

The student configures geometry, loading, and mesh density, previews the FEM setup, solves the numerical problem, and uses the result as a reference baseline.

### 2. Tutorial path

The student works through the PINN tutorial checkpoint before entering the full PINN workspace. This is intended to bridge numerical methods, machine learning, deep learning, and PINNs with interactive figures rather than static notes alone.

### 3. PINN path

The student previews collocation points, launches PINN training, watches losses and stress maps evolve, compares the result against FEM, and then experiments with teacher-guided supervision.