import { fetchFemPreview, fetchFemSolve } from "./api.js";
import { renderFemBoundaryPlot, renderFemDeformedPlot, renderFemMeshPlot, renderNotePlot, renderStressHeatmap } from "./plots.js";

export function createNumericalCell({ ui, runtimeState, shell }) {
  const state = {
    currentCheckpointId: null,
    previewTimer: null,
    latestPreview: null,
    latestSolve: null,
    isSolving: false,
    controls: null,
  };

  function enter(checkpoint) {
    state.currentCheckpointId = checkpoint.id;
    renderControls(checkpoint);
    if (!state.latestPreview) {
      schedulePreview();
    } else {
      renderCurrentCheckpoint();
    }
  }

  function leave() {
    if (state.previewTimer) {
      window.clearTimeout(state.previewTimer);
      state.previewTimer = null;
    }
    state.currentCheckpointId = null;
  }

  function renderControls(checkpoint) {
    ui.controlsForm.innerHTML = `
      <details class="toggle-panel" open>
        <summary>Geometry and Mesh</summary>
        <div class="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <label for="fem-geometry" class="field-label">Geometry</label>
            <select id="fem-geometry" class="field-input">
              <option value="base">Base Frame</option>
              <option value="diagonal">Single Diagonal</option>
              <option value="x_brace">X-Brace</option>
            </select>
          </div>
          <div>
            <div class="mb-1 flex items-center justify-between text-sm">
              <label for="fem-n-cells" class="font-medium text-slate-200">Structured Cells per Side</label>
              <span id="fem-n-cells-value" class="text-cyan-300">40</span>
            </div>
            <input id="fem-n-cells" type="range" min="12" max="80" step="2" value="40" class="field-range" />
          </div>
          <div>
            <div class="mb-1 flex items-center justify-between text-sm">
              <label for="fem-frame-thickness" class="font-medium text-slate-200">Frame Thickness</label>
              <span id="fem-frame-thickness-value" class="text-cyan-300">0.18</span>
            </div>
            <input id="fem-frame-thickness" type="range" min="0.10" max="0.32" step="0.01" value="0.18" class="field-range" />
          </div>
          <div>
            <div class="mb-1 flex items-center justify-between text-sm">
              <label for="fem-brace-half-width" class="font-medium text-slate-200">Brace Half Width</label>
              <span id="fem-brace-half-width-value" class="text-cyan-300">0.018</span>
            </div>
            <input id="fem-brace-half-width" type="range" min="0.006" max="0.05" step="0.002" value="0.018" class="field-range" />
          </div>
        </div>
      </details>

      <details class="toggle-panel" open>
        <summary>Top Load Patch</summary>
        <div class="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <div class="mb-1 flex items-center justify-between text-sm">
              <label for="fem-patch-center" class="font-medium text-slate-200">Patch Center (x)</label>
              <span id="fem-patch-center-value" class="text-cyan-300">0.50</span>
            </div>
            <input id="fem-patch-center" type="range" min="0.15" max="0.85" step="0.01" value="0.50" class="field-range" />
          </div>
          <div>
            <div class="mb-1 flex items-center justify-between text-sm">
              <label for="fem-patch-width" class="font-medium text-slate-200">Patch Width</label>
              <span id="fem-patch-width-value" class="text-cyan-300">0.20</span>
            </div>
            <input id="fem-patch-width" type="range" min="0.04" max="0.45" step="0.01" value="0.20" class="field-range" />
          </div>
        </div>
      </details>

      <details class="toggle-panel">
        <summary>Material Defaults</summary>
        <div class="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <label for="fem-young" class="field-label">Young's Modulus</label>
            <input id="fem-young" type="number" value="210000000000" step="1000000000" class="field-input" />
          </div>
          <div>
            <label for="fem-poisson" class="field-label">Poisson Ratio</label>
            <input id="fem-poisson" type="number" value="0.3" step="0.01" class="field-input" />
          </div>
        </div>
      </details>

      ${
        checkpoint.id === "numerical-solve"
          ? `
            <details class="toggle-panel" open>
              <summary>Run FEM Solve</summary>
              <div class="mt-4 space-y-4">
                <div class="rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm leading-6 text-slate-300">
                  Use the current geometry, mesh, and top-edge traction patch to solve the static plane-stress problem.
                </div>
                <button id="fem-solve-button" type="button" class="w-full rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-400">
                  Run FEM Solve
                </button>
              </div>
            </details>
          `
          : ""
      }
    `;

    state.controls = {
      geometry: ui.controlsForm.querySelector("#fem-geometry"),
      nCells: ui.controlsForm.querySelector("#fem-n-cells"),
      nCellsValue: ui.controlsForm.querySelector("#fem-n-cells-value"),
      frameThickness: ui.controlsForm.querySelector("#fem-frame-thickness"),
      frameThicknessValue: ui.controlsForm.querySelector("#fem-frame-thickness-value"),
      braceHalfWidth: ui.controlsForm.querySelector("#fem-brace-half-width"),
      braceHalfWidthValue: ui.controlsForm.querySelector("#fem-brace-half-width-value"),
      patchCenter: ui.controlsForm.querySelector("#fem-patch-center"),
      patchCenterValue: ui.controlsForm.querySelector("#fem-patch-center-value"),
      patchWidth: ui.controlsForm.querySelector("#fem-patch-width"),
      patchWidthValue: ui.controlsForm.querySelector("#fem-patch-width-value"),
      young: ui.controlsForm.querySelector("#fem-young"),
      poisson: ui.controlsForm.querySelector("#fem-poisson"),
      solveButton: ui.controlsForm.querySelector("#fem-solve-button"),
    };

    updateValueLabels();

    Object.values(state.controls).forEach((control) => {
      if (!control) {
        return;
      }
      const eventName = control.tagName === "SELECT" ? "change" : "input";
      control.addEventListener(eventName, () => {
        updateValueLabels();
        invalidateSolveResult();
        schedulePreview();
      });
      if (eventName !== "change") {
        control.addEventListener("change", () => {
          updateValueLabels();
          invalidateSolveResult();
          schedulePreview();
        });
      }
    });

    if (state.controls.solveButton) {
      state.controls.solveButton.addEventListener("click", runSolve);
      state.controls.solveButton.disabled = state.isSolving;
      state.controls.solveButton.classList.toggle("opacity-60", state.isSolving);
      state.controls.solveButton.classList.toggle("cursor-not-allowed", state.isSolving);
    }
  }

  function updateValueLabels() {
    if (!state.controls) {
      return;
    }
    state.controls.nCellsValue.textContent = state.controls.nCells.value;
    state.controls.frameThicknessValue.textContent = Number(state.controls.frameThickness.value).toFixed(2);
    state.controls.braceHalfWidthValue.textContent = Number(state.controls.braceHalfWidth.value).toFixed(3);
    state.controls.patchCenterValue.textContent = Number(state.controls.patchCenter.value).toFixed(2);
    state.controls.patchWidthValue.textContent = Number(state.controls.patchWidth.value).toFixed(2);
  }

  function getConfig() {
    return {
      geometry: {
        geometry: state.controls.geometry.value,
        frame_thickness: Number(state.controls.frameThickness.value),
        brace_half_width: Number(state.controls.braceHalfWidth.value),
      },
      material: {
        young: Number(state.controls.young.value),
        poisson: Number(state.controls.poisson.value),
      },
      support: {
        fixed_edge: "bottom",
      },
      load: {
        edge: "top",
        patch_center: Number(state.controls.patchCenter.value),
        patch_width: Number(state.controls.patchWidth.value),
        traction_x: 0.0,
        traction_y: -1.0,
      },
      mesh: {
        n_cells: Number(state.controls.nCells.value),
      },
    };
  }

  function schedulePreview() {
    shell.setStatus("Updating FEM preview...");
    shell.setControlsSummary("The Numerical Cell is fetching `/api/fem/preview` live as you change the geometry and load patch.");
    if (state.previewTimer) {
      window.clearTimeout(state.previewTimer);
    }
    state.previewTimer = window.setTimeout(fetchPreview, 120);
  }

  async function fetchPreview() {
    try {
      const payload = await fetchFemPreview(getConfig());
      state.latestPreview = payload;
      runtimeState.fem.latestPreview = payload;
      runtimeState.checkpointEvents["numerical-preview"] = {
        status: "success",
        caseId: payload.case_id,
      };
      shell.refreshProgress();

      if (!state.currentCheckpointId?.startsWith("numerical")) {
        return;
      }
      renderCurrentCheckpoint();
      shell.setStatus(`FEM preview ready (${payload.case_id})`);
      updateGuide();
    } catch (error) {
      shell.setStatus("FEM preview error");
      shell.setGuide(`Unable to build the FEM preview.<br><br>${String(error)}`);
      renderNotePlot(ui.bottomPlot, "Preview Error", [String(error)]);
    }
  }

  async function runSolve() {
    if (!state.controls?.solveButton || state.isSolving) {
      return;
    }

    state.isSolving = true;
    state.controls.solveButton.disabled = true;
    state.controls.solveButton.classList.add("opacity-60", "cursor-not-allowed");
    shell.setStatus("Running FEM solve...");
    shell.setGuide(
      "<strong>Solving the FEM system.</strong><br><br>" +
        "The Numerical Cell is assembling the stiffness matrix, applying the top-edge traction patch, and post-processing the von Mises field.",
    );

    try {
      const payload = await fetchFemSolve(getConfig());
      state.latestSolve = payload;
      runtimeState.fem.latestSolve = payload;
      runtimeState.checkpointEvents["numerical-solve"] = {
        status: "success",
        caseId: payload.case_id,
        maxVonMises: payload.summary.max_von_mises,
        maxDisplacement: payload.summary.max_displacement,
      };
      shell.refreshProgress();
      renderCurrentCheckpoint();
      shell.setStatus(`FEM solve complete (${payload.case_id})`);
      updateGuide();
    } catch (error) {
      runtimeState.checkpointEvents["numerical-solve"] = {
        status: "error",
        message: String(error),
      };
      shell.refreshProgress();
      shell.setStatus("FEM solve error");
      shell.setGuide(`Unable to solve the FEM system.<br><br>${String(error)}`);
      renderNotePlot(ui.bottomPlot, "Solve Error", [String(error)]);
    } finally {
      state.isSolving = false;
      if (state.controls?.solveButton) {
        state.controls.solveButton.disabled = false;
        state.controls.solveButton.classList.remove("opacity-60", "cursor-not-allowed");
      }
    }
  }

  function renderCurrentCheckpoint() {
    if (state.currentCheckpointId === "numerical-preview") {
      renderPreviewCheckpoint();
      return;
    }
    if (state.currentCheckpointId === "numerical-solve") {
      renderSolveCheckpoint();
      return;
    }
    renderInspectCheckpoint();
  }

  function renderPreviewCheckpoint() {
    if (state.latestPreview) {
      renderFemMeshPlot(ui.leftPlot, state.latestPreview);
      renderFemBoundaryPlot(ui.rightPlot, state.latestPreview);
      renderNotePlot(ui.bottomPlot, "Numerical Preview Summary", [
        `Case ID: ${state.latestPreview.case_id}`,
        `Nodes: ${state.latestPreview.mesh.counts.n_nodes}`,
        `Elements: ${state.latestPreview.mesh.counts.n_elements}`,
        `Boundary facets: ${state.latestPreview.mesh.counts.n_boundary_facets}`,
      ]);
      shell.setPlotMeta({
        leftTitle: "Structured FEM Mesh",
        leftSummary: `${state.latestPreview.mesh.counts.n_elements} elements`,
        rightTitle: "Boundary Conditions",
        rightSummary: "Bottom support and top load patch",
        bottomTitle: "Checkpoint Notes",
        bottomSummary: "Numerical preview payload",
      });
    } else {
      renderNotePlot(ui.leftPlot, "Numerical preview", [
        "Choose geometry and mesh settings to generate the first FEM preview.",
      ]);
      renderNotePlot(ui.rightPlot, "Boundary conditions", [
        "The fixed bottom edge and top load patch will be highlighted there.",
      ]);
      renderNotePlot(ui.bottomPlot, "Preview summary", [
        "Mesh counts and boundary metadata will appear here.",
      ]);
    }
    shell.setControlsSummary("The Numerical Cell is fetching `/api/fem/preview` live as you change the geometry and load patch.");
  }

  function renderSolveCheckpoint() {
    if (state.latestSolve) {
      renderFemDeformedPlot(ui.leftPlot, state.latestSolve);
      renderStressHeatmap(ui.rightPlot, state.latestSolve.stress_grid);
      renderNotePlot(ui.bottomPlot, "FEM Solve Summary", [
        `Solve time: ${state.latestSolve.summary.solve_time_ms.toFixed(3)} ms`,
        `Max displacement: ${formatNumber(state.latestSolve.summary.max_displacement)}`,
        `Max von Mises: ${formatNumber(state.latestSolve.summary.max_von_mises)}`,
        `Deformation scale: ${formatNumber(state.latestSolve.summary.deformation_scale)}`,
      ]);
      shell.setPlotMeta({
        leftTitle: "Deformed Mesh",
        leftSummary: `Scale ${formatNumber(state.latestSolve.summary.deformation_scale)}`,
        rightTitle: "Von Mises Stress",
        rightSummary: `Max ${formatNumber(state.latestSolve.summary.max_von_mises)}`,
        bottomTitle: "FEM Solve Summary",
        bottomSummary: `${state.latestSolve.summary.solve_time_ms.toFixed(3)} ms`,
      });
      return;
    }

    if (state.latestPreview) {
      renderFemMeshPlot(ui.leftPlot, state.latestPreview);
      renderFemBoundaryPlot(ui.rightPlot, state.latestPreview);
    } else {
      renderNotePlot(ui.leftPlot, "Numerical preview", [
        "Preview data will appear here before you run the solve.",
      ]);
      renderNotePlot(ui.rightPlot, "Boundary conditions", [
        "The current support and load patch will appear here.",
      ]);
    }
    renderNotePlot(ui.bottomPlot, "Run FEM Solve", [
      "Click the solve button to compute deformation and von Mises stress for the current setup.",
      "This checkpoint completes automatically once the solve succeeds.",
    ]);
    shell.setPlotMeta({
      leftTitle: "Current Mesh",
      leftSummary: state.latestPreview ? `${state.latestPreview.mesh.counts.n_elements} elements` : "Preview not generated yet",
      rightTitle: "Current Boundary Conditions",
      rightSummary: "Ready for solve",
      bottomTitle: "Solve Checkpoint",
      bottomSummary: "Waiting for FEM solve",
    });
  }

  function renderInspectCheckpoint() {
    if (state.latestSolve) {
      renderFemDeformedPlot(ui.leftPlot, state.latestSolve);
      renderStressHeatmap(ui.rightPlot, state.latestSolve.stress_grid);
      renderNotePlot(ui.bottomPlot, "Numerical Reflection", [
        `Case ID: ${state.latestSolve.case_id}`,
        `Load facets: ${state.latestSolve.summary.n_load_facets}`,
        `Mean von Mises: ${formatNumber(state.latestSolve.summary.mean_von_mises)}`,
        "Use this result as the trust baseline before you continue into the PINN cell.",
      ]);
      shell.setPlotMeta({
        leftTitle: "Deformed Mesh",
        leftSummary: `Scale ${formatNumber(state.latestSolve.summary.deformation_scale)}`,
        rightTitle: "Von Mises Stress",
        rightSummary: `Mean ${formatNumber(state.latestSolve.summary.mean_von_mises)}`,
        bottomTitle: "Numerical Reflection",
        bottomSummary: "Baseline ready for comparison",
      });
      return;
    }

    renderSolveCheckpoint();
    shell.setGuide(
      "<strong>Inspect the numerical result.</strong><br><br>" +
        "Run the FEM solve first so this checkpoint has a real baseline to reflect on.",
    );
  }

  function invalidateSolveResult() {
    state.latestSolve = null;
    runtimeState.fem.latestSolve = null;
    if (runtimeState.checkpointEvents["numerical-solve"]?.status === "success") {
      runtimeState.checkpointEvents["numerical-solve"] = {
        status: "stale",
      };
      shell.refreshProgress();
    }
  }

  function updateGuide() {
    if (!state.controls) {
      return;
    }

    const notes = [];
    const nCells = Number(state.controls.nCells.value);
    const patchWidth = Number(state.controls.patchWidth.value);
    const geometry = state.controls.geometry.value;
    const frameThickness = Number(state.controls.frameThickness.value);

    if (nCells < 24) {
      notes.push("<strong>Coarse structured mesh.</strong> The preview is fine for storytelling, but stress concentration near corners will need more elements later.");
    }
    if (patchWidth < 0.10) {
      notes.push("<strong>Narrow top load patch.</strong> The load becomes more localized and will demand better mesh quality in the final FEM solve.");
    }
    if (frameThickness > 0.24) {
      notes.push("<strong>Thick frame.</strong> Reinforcement effects may look less dramatic because the base frame is already quite stiff.");
    }
    if (geometry === "diagonal") {
      notes.push("<strong>Single diagonal selected.</strong> Use the preview to inspect how the brace band reconnects the opening.");
    }
    if (geometry === "x_brace") {
      notes.push("<strong>X-brace selected.</strong> Expect more internal boundary segments and a denser highlighted region in the mesh.");
    }
    if (state.latestSolve && state.currentCheckpointId !== "numerical-preview") {
      notes.push(
        `<strong>FEM solve available.</strong> Max von Mises is ${formatNumber(state.latestSolve.summary.max_von_mises)} and the deformed mesh is scaled by ${formatNumber(state.latestSolve.summary.deformation_scale)} for visibility.`,
      );
    }

    if (!notes.length) {
      notes.push("<strong>Numerical baseline preview ready.</strong> Review the support and top-edge load patch, then continue when the setup feels clear.");
    }

    shell.setGuide(notes.join("<br><br>"));
  }

  return {
    enter,
    leave,
  };
}

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  if (Math.abs(value) >= 1000 || (Math.abs(value) > 0 && Math.abs(value) < 1e-3)) {
    return value.toExponential(3);
  }
  return value.toFixed(4);
}
