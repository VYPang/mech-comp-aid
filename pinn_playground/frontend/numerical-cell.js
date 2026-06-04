import { fetchFemPreview, fetchFemSolve } from "./api.js?v=checkpoint-shell-15";
import { buildFemConfig, DEFAULT_FEM_CONTROLS, mergeControlValues, mergeSharedStructuralValues, pickSharedStructuralValues, readFemControlValues } from "./control-config.js?v=checkpoint-shell-15";
import { buildNumericalGuideSections } from "./guide-content.js?v=checkpoint-shell-15";
import { buildNumericalTaskChecks } from "./numerical-task-progress.js?v=checkpoint-shell-17";
import { renderFemBoundaryPlot, renderFemDeformedPlot, renderFemMeshPlot, renderNotePlot, renderStressHeatmap } from "./plots.js?v=checkpoint-shell-15";

const NUMERICAL_CHECKPOINT_ID = "numerical-session";
const TARGET_MESH_CELLS = 80;
const TARGET_YOUNG_MODULUS = 211000;

export function createNumericalCell({ ui, runtimeState, shell }) {
  const state = {
    currentCheckpointId: null,
    previewTimer: null,
    latestPreview: null,
    latestSolve: null,
    isPreviewing: false,
    isSolving: false,
    controls: null,
    taskState: createInitialTaskState(),
  };

  function createInitialTaskState() {
    return {
      geometryTouched: false,
      loadingPatchTouched: false,
      meshTargetReached: false,
      youngTargetReached: false,
      solvedAtTargetCells: false,
      solvedAtTargetYoung: false,
    };
  }

  function getMergedFemControls() {
    return mergeSharedStructuralValues(
      mergeControlValues(DEFAULT_FEM_CONTROLS, runtimeState.fem?.savedControls),
      runtimeState.sharedStructuralControls,
    );
  }

  function syncFemControlsToRuntime() {
    if (!state.controls?.geometry) {
      return buildFemConfig(getMergedFemControls());
    }
    if (!runtimeState.fem) {
      runtimeState.fem = {};
    }
    const values = readFemControlValues(state.controls, getMergedFemControls());
    const config = buildFemConfig(values);
    runtimeState.fem.savedControls = values;
    runtimeState.fem.currentConfig = config;
    runtimeState.sharedStructuralControls = pickSharedStructuralValues(values);
    return config;
  }

  function enter(checkpoint) {
    state.currentCheckpointId = checkpoint.id;
    shell.setBottomPanelVisible(false);
    renderControls(checkpoint);
    updateNumericalTaskProgress();
    const currentConfig = getConfig();
    const previewIsCurrent =
      state.latestPreview
      && configsMatch(runtimeState.fem?.latestPreviewConfig, currentConfig);
    const solveIsCurrent =
      state.latestSolve
      && configsMatch(runtimeState.fem?.latestSolveConfig, currentConfig);

    if (!previewIsCurrent) {
      state.latestPreview = null;
      if (runtimeState.fem) {
        runtimeState.fem.latestPreview = null;
        runtimeState.fem.latestPreviewConfig = null;
      }
    }

    if (!solveIsCurrent && state.latestSolve) {
      invalidateSolveResult();
    }

    if (!previewIsCurrent) {
      schedulePreview();
    } else {
      renderCurrentCheckpoint();
    }
  }

  function leave() {
    syncFemControlsToRuntime();
    if (state.previewTimer) {
      window.clearTimeout(state.previewTimer);
      state.previewTimer = null;
    }
    state.currentCheckpointId = null;
    shell.setBottomPanelVisible(true);
  }

  function reset() {
    state.latestPreview = null;
    state.latestSolve = null;
    state.taskState = createInitialTaskState();
    if (runtimeState.taskProgress) {
      delete runtimeState.taskProgress[NUMERICAL_CHECKPOINT_ID];
    }
  }

  function renderControls(checkpoint) {
    const v = getMergedFemControls();
    ui.controlsForm.innerHTML = `
      <details class="toggle-panel">
        <summary>Geometry</summary>
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

      <details class="toggle-panel">
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

      <section class="control-card space-y-4">
        <div>
          <p class="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Run FEM Solve</p>
          <p class="mt-2 text-sm leading-6 text-slate-300">
            Use the current setup to solve one static plane-stress case and compare deformation against von Mises stress.
          </p>
        </div>
        <div class="control-card">
          <div class="range-row">
            <label for="fem-n-cells">Structured Cells per Side</label>
            <span id="fem-n-cells-value" class="range-value"></span>
          </div>
          <input id="fem-n-cells" type="range" min="12" max="80" step="2" value="${v.nCells}" class="field-range" />
          <p class="field-help">More cells resolve corners and load transfer more clearly.</p>
        </div>
        <button id="fem-solve-button" type="button" class="w-full rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-400">
          Run FEM Solve
        </button>
        <div id="fem-summary-table"></div>
      </section>
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
    syncFemControlsToRuntime();

    [
      { control: state.controls.geometry, key: "geometry" },
      { control: state.controls.nCells, key: "nCells" },
      { control: state.controls.frameThickness, key: "frameThickness" },
      { control: state.controls.braceHalfWidth, key: "braceHalfWidth" },
      { control: state.controls.patchCenter, key: "patchCenter" },
      { control: state.controls.patchWidth, key: "patchWidth" },
      { control: state.controls.young, key: "young" },
      { control: state.controls.poisson, key: "poisson" },
    ]
      .filter(({ control }) => Boolean(control))
      .forEach(({ control, key }) => {
        const eventName = control.tagName === "SELECT" ? "change" : "input";
        control.addEventListener(eventName, () => {
          updateValueLabels();
          syncFemControlsToRuntime();
          recordTaskControlChange(key);
          invalidateSolveResult();
          updateNumericalTaskProgress();
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
    return syncFemControlsToRuntime();
  }

  function recordTaskControlChange(key) {
    if (key === "geometry") {
      state.taskState.geometryTouched = true;
    }
    if (key === "patchCenter" || key === "patchWidth") {
      state.taskState.loadingPatchTouched = true;
    }
    if (key === "nCells" && Number(state.controls?.nCells?.value) === TARGET_MESH_CELLS) {
      state.taskState.meshTargetReached = true;
    }
    if (key === "young" && Number(state.controls?.young?.value) === TARGET_YOUNG_MODULUS) {
      state.taskState.youngTargetReached = true;
    }
  }

  function updateNumericalTaskProgress({ refresh = true } = {}) {
    if (!runtimeState.taskProgress) {
      runtimeState.taskProgress = {};
    }
    if (Number(state.controls?.nCells?.value) === TARGET_MESH_CELLS) {
      state.taskState.meshTargetReached = true;
    }
    if (Number(state.controls?.young?.value) === TARGET_YOUNG_MODULUS) {
      state.taskState.youngTargetReached = true;
    }

    const taskChecks = buildNumericalTaskChecks(state.taskState);
    const activeIndex = taskChecks.findIndex((task) => !task.complete);
    const allComplete = activeIndex === -1;
    const tasks = Object.fromEntries(
      taskChecks.map((task, index) => [
        task.id,
        {
          completed: allComplete || index < activeIndex,
          status: allComplete || index < activeIndex
            ? "completed"
            : index === activeIndex
              ? "active"
              : "locked",
        },
      ]),
    );

    runtimeState.taskProgress[NUMERICAL_CHECKPOINT_ID] = {
      allComplete,
      activeTaskId: allComplete ? null : taskChecks[activeIndex].id,
      tasks,
      updatedAt: new Date().toISOString(),
    };

    if (refresh) {
      shell.refreshProgress();
    }
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
      const config = getConfig();
      const payload = await fetchFemPreview(config);
      state.isPreviewing = false;
      state.latestPreview = payload;
      runtimeState.fem.latestPreview = payload;
      runtimeState.fem.latestPreviewConfig = config;
      runtimeState.checkpointEvents[`${NUMERICAL_CHECKPOINT_ID}:preview`] = {
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
      const config = getConfig();
      const payload = await fetchFemSolve(config);
      state.latestSolve = payload;
      runtimeState.fem.latestSolve = payload;
      runtimeState.fem.latestSolveConfig = config;
      if (Number(config.mesh.n_cells) === TARGET_MESH_CELLS) {
        state.taskState.solvedAtTargetCells = true;
      }
      if (Number(config.material.young) === TARGET_YOUNG_MODULUS) {
        state.taskState.youngTargetReached = true;
        state.taskState.solvedAtTargetYoung = true;
      }
      updateNumericalTaskProgress({ refresh: false });
      runtimeState.checkpointEvents[NUMERICAL_CHECKPOINT_ID] = {
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
      runtimeState.checkpointEvents[NUMERICAL_CHECKPOINT_ID] = {
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
      _renderSummaryTable([["Error", String(error)]]);
    } finally {
      state.isSolving = false;
      if (state.controls?.solveButton) {
        state.controls.solveButton.disabled = false;
        state.controls.solveButton.classList.remove("opacity-60", "cursor-not-allowed");
      }
    }
  }

  function renderCurrentCheckpoint() {
    renderNumericalWorkspace();
  }

  function renderNumericalWorkspace() {
    renderSolveCheckpoint();
  }

  function renderPreviewCheckpoint() {
    if (state.latestPreview) {
      renderFemMeshPlot(ui.leftPlot, state.latestPreview);
      renderFemBoundaryPlot(ui.rightPlot, state.latestPreview);
      shell.setPlotMeta({
        leftTitle: "Structured FEM Mesh",
        leftSummary: `${state.latestPreview.mesh.counts.n_elements} elements`,
        rightTitle: "Boundary Conditions",
        rightSummary: "Bottom support and top load patch",
      });
    } else {
      renderNotePlot(ui.leftPlot, "Numerical preview", [
        "Choose geometry and mesh settings to generate the first FEM preview.",
      ]);
      renderNotePlot(ui.rightPlot, "Boundary conditions", [
        "The fixed bottom edge and top load patch will be highlighted there.",
      ]);
    }
    shell.setControlsSummary("Use this preview to verify the support, load patch, and geometry before solving.");
  }

  function renderSolveCheckpoint() {
    if (state.latestSolve) {
      renderFemDeformedPlot(ui.leftPlot, state.latestSolve);
      renderStressHeatmap(ui.rightPlot, state.latestSolve.stress_grid);
      _renderSummaryTable([
        ["Solve time",        `${state.latestSolve.summary.solve_time_ms.toFixed(3)} ms`],
        ["Max displacement",  formatNumber(state.latestSolve.summary.max_displacement)],
        ["Max von Mises",     formatNumber(state.latestSolve.summary.max_von_mises)],
        ["Deformation scale", formatNumber(state.latestSolve.summary.deformation_scale)],
        ["Load facets",       String(state.latestSolve.summary.n_load_facets)],
        ["Max |σ_xx|",        formatNumber(state.latestSolve.summary.max_abs_sxx)],
        ["Max |σ_yy|",        formatNumber(state.latestSolve.summary.max_abs_syy)],
        ["Max |τ_xy|",        formatNumber(state.latestSolve.summary.max_abs_txy)],
      ]);
      shell.setPlotMeta({
        leftTitle: "Deformed Mesh",
        leftSummary: `Scale ${formatNumber(state.latestSolve.summary.deformation_scale)}`,
        rightTitle: "Von Mises Stress",
        rightSummary: `Max ${formatNumber(state.latestSolve.summary.max_von_mises)}`,
      });
      shell.setControlsSummary("The latest FEM solve is on screen. Change one setting and rerun to compare cause and effect.");
      return;
    }

    const solveIsStale = runtimeState.checkpointEvents[NUMERICAL_CHECKPOINT_ID]?.status === "stale";
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
    _renderSummaryTable([]);
    shell.setPlotMeta({
      leftTitle: "Current Mesh",
      leftSummary: state.latestPreview ? `${state.latestPreview.mesh.counts.n_elements} elements` : "Preview not generated yet",
      rightTitle: "Current Boundary Conditions",
      rightSummary: solveIsStale ? "Preview changed since the last solve" : "Ready for solve",
    });
  }

  function renderInspectCheckpoint() {
    if (state.latestSolve) {
      renderFemDeformedPlot(ui.leftPlot, state.latestSolve);
      renderStressHeatmap(ui.rightPlot, state.latestSolve.stress_grid);
      _renderSummaryTable([
        ["Case ID",          state.latestSolve.case_id],
        ["Max von Mises",    formatNumber(state.latestSolve.summary.max_von_mises)],
        ["Mean von Mises",   formatNumber(state.latestSolve.summary.mean_von_mises)],
        ["Max displacement", formatNumber(state.latestSolve.summary.max_displacement)],
        ["Load facets",      String(state.latestSolve.summary.n_load_facets)],
        ["Solve time",       `${state.latestSolve.summary.solve_time_ms.toFixed(3)} ms`],
      ]);
      shell.setPlotMeta({
        leftTitle: "Deformed Mesh",
        leftSummary: `Scale ${formatNumber(state.latestSolve.summary.deformation_scale)}`,
        rightTitle: "Von Mises Stress",
        rightSummary: `Mean ${formatNumber(state.latestSolve.summary.mean_von_mises)}`,
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
    runtimeState.fem.latestSolveConfig = null;
    if (runtimeState.checkpointEvents[NUMERICAL_CHECKPOINT_ID]?.status === "success") {
      runtimeState.checkpointEvents[NUMERICAL_CHECKPOINT_ID] = {
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
    shell.setGuideSections(buildNumericalGuideSections({
      controls: readFemControlValues(state.controls, getMergedFemControls()),
      latestSolve: state.latestSolve,
      currentCheckpointId: state.currentCheckpointId,
      solveStatus: runtimeState.checkpointEvents[NUMERICAL_CHECKPOINT_ID]?.status,
    }));
  }

  function _renderSummaryTable(rows) {
    const el = document.getElementById("fem-summary-table");
    if (!el) return;
    if (!rows.length) {
      el.innerHTML = "";
      return;
    }
    el.innerHTML = `
      <table style="
        width:100%; border-collapse:collapse; margin-top:12px;
        font-size:0.78rem; color:#cbd5e1;
      ">
        <tbody>
          ${rows.map(([label, value]) => `
            <tr style="border-top:1px solid rgba(148,163,184,0.15);">
              <td style="padding:5px 8px; color:#94a3b8; font-weight:500; white-space:nowrap;">${label}</td>
              <td style="padding:5px 8px; text-align:right; font-family:monospace; color:#e2e8f0;">${value}</td>
            </tr>`).join("")}
        </tbody>
      </table>`;
  }

  return {
    enter,
    leave,
    reset,
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

function configsMatch(left, right) {
  if (!left || !right) {
    return false;
  }
  return JSON.stringify(left) === JSON.stringify(right);
}
