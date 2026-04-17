import { fetchFemPreview, fetchFemSolve } from "./api.js?v=checkpoint-shell-6";
import { renderFemBoundaryPlot, renderFemDeformedPlot, renderFemMeshPlot, renderNotePlot, renderStressHeatmap } from "./plots.js?v=checkpoint-shell-6";

/** Defaults when no saved state (e.g. first visit or after reset). */
const DEFAULT_FEM_CONTROLS = {
  geometry: "base",
  nCells: "40",
  frameThickness: "0.18",
  braceHalfWidth: "0.018",
  patchCenter: "0.50",
  patchWidth: "0.20",
  young: "210000000000",
  poisson: "0.3",
};

export function createNumericalCell({ ui, runtimeState, shell }) {
  const state = {
    currentCheckpointId: null,
    previewTimer: null,
    latestPreview: null,
    latestSolve: null,
    isPreviewing: false,
    isSolving: false,
    controls: null,
  };

  function getMergedFemControls() {
    return { ...DEFAULT_FEM_CONTROLS, ...(runtimeState.fem?.savedControls ?? {}) };
  }

  function captureFemControlsToRuntime() {
    if (!state.controls?.geometry) {
      return;
    }
    if (!runtimeState.fem) {
      runtimeState.fem = {};
    }
    runtimeState.fem.savedControls = {
      geometry: state.controls.geometry.value,
      nCells: state.controls.nCells.value,
      frameThickness: state.controls.frameThickness.value,
      braceHalfWidth: state.controls.braceHalfWidth.value,
      patchCenter: state.controls.patchCenter.value,
      patchWidth: state.controls.patchWidth.value,
      young: state.controls.young.value,
      poisson: state.controls.poisson.value,
    };
  }

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
    captureFemControlsToRuntime();
    if (state.previewTimer) {
      window.clearTimeout(state.previewTimer);
      state.previewTimer = null;
    }
    state.currentCheckpointId = null;
  }

  function renderControls(checkpoint) {
    const v = getMergedFemControls();
    ui.controlsForm.innerHTML = `
      <details class="toggle-panel" open>
        <summary>Geometry and Mesh</summary>
        <div class="control-section-grid mt-4 lg:grid-cols-2">
          <div class="control-card">
            <label for="fem-geometry" class="field-label">Geometry</label>
            <select id="fem-geometry" class="field-input">
              <option value="base" ${v.geometry === "base" ? "selected" : ""}>Base Frame</option>
              <option value="diagonal" ${v.geometry === "diagonal" ? "selected" : ""}>Single Diagonal</option>
              <option value="x_brace" ${v.geometry === "x_brace" ? "selected" : ""}>X-Brace</option>
            </select>
            <p class="field-help">Pick the frame layout you want to inspect before solving.</p>
          </div>
          <div class="control-card">
            <div class="range-row">
              <label for="fem-n-cells">Structured Cells per Side</label>
              <span id="fem-n-cells-value" class="range-value"></span>
            </div>
            <input id="fem-n-cells" type="range" min="12" max="80" step="2" value="${v.nCells}" class="field-range" />
            <p class="field-help">More cells resolve corners and load transfer more clearly.</p>
          </div>
          <div class="control-card">
            <div class="range-row">
              <label for="fem-frame-thickness">Frame Thickness</label>
              <span id="fem-frame-thickness-value" class="range-value"></span>
            </div>
            <input id="fem-frame-thickness" type="range" min="0.10" max="0.32" step="0.01" value="${v.frameThickness}" class="field-range" />
            <p class="field-help">A thinner frame makes reinforcement effects easier to see.</p>
          </div>
          <div class="control-card">
            <div class="range-row">
              <label for="fem-brace-half-width">Brace Half Width</label>
              <span id="fem-brace-half-width-value" class="range-value"></span>
            </div>
            <input id="fem-brace-half-width" type="range" min="0.006" max="0.05" step="0.002" value="${v.braceHalfWidth}" class="field-range" />
            <p class="field-help">Brace width only matters for the reinforced geometries.</p>
          </div>
        </div>
      </details>

      <details class="toggle-panel" open>
        <summary>Top Load Patch</summary>
        <div class="control-section-grid mt-4 lg:grid-cols-2">
          <div class="control-card">
            <div class="range-row">
              <label for="fem-patch-center">Patch Center (x)</label>
              <span id="fem-patch-center-value" class="range-value"></span>
            </div>
            <input id="fem-patch-center" type="range" min="0.15" max="0.85" step="0.01" value="${v.patchCenter}" class="field-range" />
            <p class="field-help">Slide the applied traction left or right along the top edge.</p>
          </div>
          <div class="control-card">
            <div class="range-row">
              <label for="fem-patch-width">Patch Width</label>
              <span id="fem-patch-width-value" class="range-value"></span>
            </div>
            <input id="fem-patch-width" type="range" min="0.04" max="0.45" step="0.01" value="${v.patchWidth}" class="field-range" />
            <p class="field-help">A narrower patch creates a more localized response.</p>
          </div>
        </div>
      </details>

      <details class="toggle-panel">
        <summary>Material Defaults</summary>
        <div class="control-section-grid mt-4 lg:grid-cols-2">
          <div class="control-card">
            <label for="fem-young" class="field-label">Young's Modulus</label>
            <input id="fem-young" type="number" value="${v.young}" step="1000000000" class="field-input" />
            <p class="field-help">Default steel stiffness for the teaching baseline.</p>
          </div>
          <div class="control-card">
            <label for="fem-poisson" class="field-label">Poisson Ratio</label>
            <input id="fem-poisson" type="number" value="${v.poisson}" step="0.01" class="field-input" />
            <p class="field-help">Lateral contraction ratio used during the solve.</p>
          </div>
        </div>
      </details>

      ${
        checkpoint.id === "numerical-solve"
          ? `
            <details class="toggle-panel" open>
              <summary>Run FEM Solve</summary>
              <div class="mt-4 space-y-4">
                <div class="control-card text-sm leading-6 text-slate-300">
                  Use the current setup to solve one static plane-stress case and compare deformation against von Mises stress.
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

    [
      state.controls.geometry,
      state.controls.nCells,
      state.controls.frameThickness,
      state.controls.braceHalfWidth,
      state.controls.patchCenter,
      state.controls.patchWidth,
      state.controls.young,
      state.controls.poisson,
    ]
      .filter(Boolean)
      .forEach((control) => {
        const eventName = control.tagName === "SELECT" ? "change" : "input";
        control.addEventListener(eventName, () => {
          updateValueLabels();
          invalidateSolveResult();
          schedulePreview();
        });
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
    state.isPreviewing = true;
    shell.setStatus("Refreshing numerical preview", {
      tone: "preview",
      detail: "Mesh and boundary views update automatically as you change geometry or the top load patch.",
    });
    shell.setControlsSummary("Preview updates automatically as you change geometry, mesh density, or the top load patch.");
    if (state.previewTimer) {
      window.clearTimeout(state.previewTimer);
    }
    state.previewTimer = window.setTimeout(fetchPreview, 120);
  }

  async function fetchPreview() {
    try {
      const payload = await fetchFemPreview(getConfig());
      state.isPreviewing = false;
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
      shell.setStatus("Numerical preview ready", {
        tone: "success",
        detail: `Case ${payload.case_id} is ready to inspect or solve.`,
      });
      updateGuide();
    } catch (error) {
      state.isPreviewing = false;
      shell.setStatus("Numerical preview failed", {
        tone: "error",
        detail: "The preview request did not complete successfully.",
      });
      shell.setGuideSections([
        {
          title: "What to do next",
          items: [`Check the current inputs and retry the preview.`, String(error)],
        },
      ]);
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
    shell.setStatus("Running FEM solve", {
      tone: "running",
      detail: "The solver is assembling the system, applying the top-edge traction patch, and post-processing the field.",
    });
    shell.setGuideSections([
      {
        title: "What is happening",
        items: [
          "The mesh and boundary conditions are being assembled into one static solve.",
          "You will get a deformed mesh, a stress map, and a short solver summary.",
        ],
      },
      {
        title: "Why it matters",
        items: ["This numerical result is the trust baseline for the later PINN comparison."],
      },
    ]);

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
      shell.setStatus("FEM solve complete", {
        tone: "success",
        detail: `Case ${payload.case_id} solved successfully. Review deformation, stress, and solve time.`,
      });
      updateGuide();
    } catch (error) {
      runtimeState.checkpointEvents["numerical-solve"] = {
        status: "error",
        message: String(error),
      };
      shell.refreshProgress();
      shell.setStatus("FEM solve failed", {
        tone: "error",
        detail: "The solve request returned an error before a result could be shown.",
      });
      shell.setGuideSections([
        {
          title: "What to do next",
          items: ["Check the current setup, then rerun the solve.", String(error)],
        },
      ]);
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
        bottomSummary: `Case ${state.latestPreview.case_id}`,
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
    shell.setControlsSummary("Use this preview to verify the support, load patch, and geometry before solving.");
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

    const solveIsStale = runtimeState.checkpointEvents["numerical-solve"]?.status === "stale";
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
      solveIsStale
        ? "The previous solve is out of date because the setup changed. Run the solve again."
        : "Click the solve button to compute deformation and von Mises stress for the current setup.",
      "This checkpoint completes automatically once the solve succeeds.",
    ]);
    shell.setPlotMeta({
      leftTitle: "Current Mesh",
      leftSummary: state.latestPreview ? `${state.latestPreview.mesh.counts.n_elements} elements` : "Preview not generated yet",
      rightTitle: "Current Boundary Conditions",
      rightSummary: solveIsStale ? "Preview changed since the last solve" : "Ready for solve",
      bottomTitle: "Solve Checkpoint",
      bottomSummary: solveIsStale ? "Solve is stale" : "Waiting for FEM solve",
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
    shell.setGuideSections([
      {
        title: "What to do next",
        items: ["Run the FEM solve first so this reflection step has a real numerical baseline."],
      },
    ]);
  }

  function invalidateSolveResult() {
    state.latestSolve = null;
    runtimeState.fem.latestSolve = null;
    if (runtimeState.checkpointEvents["numerical-solve"]?.status === "success") {
      runtimeState.checkpointEvents["numerical-solve"] = {
        status: "stale",
      };
      shell.refreshProgress();
      shell.setStatus("Numerical result needs a rerun", {
        tone: "warning",
        detail: "The preview changed after the last solve, so the displayed result is no longer current.",
      });
      updateGuide();
    }
  }

  function updateGuide() {
    if (!state.controls) {
      return;
    }

    const notice = [];
    const tryNext = [];
    const why = [];
    const nCells = Number(state.controls.nCells.value);
    const patchWidth = Number(state.controls.patchWidth.value);
    const geometry = state.controls.geometry.value;
    const frameThickness = Number(state.controls.frameThickness.value);

    if (nCells < 24) {
      notice.push("The mesh is still coarse, so corners and load concentrations will be smoothed out.");
      tryNext.push("Increase cells per side if you want a sharper stress picture.");
    }
    if (patchWidth < 0.10) {
      notice.push("The top load patch is narrow, so the force is more localized.");
    }
    if (frameThickness > 0.24) {
      notice.push("This is a thick frame, so added reinforcement may look less dramatic.");
    }
    if (geometry === "diagonal") {
      notice.push("A single diagonal brace creates one main alternate load path.");
    }
    if (geometry === "x_brace") {
      notice.push("The X-brace creates the stiffest reinforced option in this set.");
    }
    if (state.latestSolve && state.currentCheckpointId !== "numerical-preview") {
      notice.push(
        `Latest solve: max von Mises ${formatNumber(state.latestSolve.summary.max_von_mises)}, deformation scale ${formatNumber(state.latestSolve.summary.deformation_scale)}.`,
      );
      why.push("Use this solved field as the numerical reference before trusting a PINN prediction.");
    }

    if (runtimeState.checkpointEvents["numerical-solve"]?.status === "stale") {
      tryNext.push("Run the FEM solve again so the result matches the current preview.");
    }

    if (state.currentCheckpointId === "numerical-preview") {
      why.push("This step is about reading support and load placement before asking the solver for numbers.");
    } else if (state.currentCheckpointId === "numerical-solve") {
      tryNext.push("Solve once, then compare the deformed shape against the stress hot spots.");
      why.push("A fast numerical baseline helps students judge whether a later PINN answer looks believable.");
    } else {
      tryNext.push("Compare where the frame deforms most against where the stress field peaks.");
      why.push("This reflection step prepares the mental model you will carry into PINN training.");
    }

    if (!notice.length) {
      notice.push("The numerical preview is ready. Check the support and top load placement before moving on.");
    }

    shell.setGuideSections([
      { title: "What to notice", items: notice.slice(0, 3) },
      { title: "What to try", items: tryNext.slice(0, 2) },
      { title: "Why it matters", items: why.slice(0, 2) },
    ]);
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
