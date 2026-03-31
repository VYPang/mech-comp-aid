# MECH Comp Aid

Welcome to the MECH Comp Aid repository. This repository contains various labs, code, and projects.

## Sub-Projects

Be sure to check out the detailed documentation for the individual projects:

- [PINN Playground](pinn_playground/README.md)
- [Project 1](project1/README.md)

## Installation and Setup

This project uses [`uv`](https://github.com/astral-sh/uv) for fast Python dependency management.

### Prerequisites

You will need to have `uv` installed. If you haven't installed it yet, you can do so by following the [official uv installation guide](https://github.com/astral-sh/uv).

### Quick Start

1. **Clone the repository:**
   ```bash
   git clone https://github.com/VYPang/mech-comp-aid.git
   cd mech-comp-aid
   ```

2. **Sync the dependencies:**
   Because this project includes a `pyproject.toml` and `uv.lock`, you can install all required dependencies directly into a new virtual environment by running:
   ```bash
   uv sync
   ```

3. **Activate the environment:**
   ```bash
   # On macOS and Linux:
   source .venv/bin/activate

   # On Windows:
   .venv\Scripts\activate
   ```

Now you are ready to run the scripts and notebooks in this repository!
