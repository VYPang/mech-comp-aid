import { createPinnSocket, fetchPinnPreview } from "./api.js?v=checkpoint-shell-10";
import { renderLossPlot, renderNotePlot, renderPointCloudPlot, renderStressHeatmap, renderErrorHeatmap } from "./plots.js?v=checkpoint-shell-10";

/** Defaults when no saved state (e.g. first visit or after reset). */
const DEFAULT_PINN_CONTROLS = {
  geometry: "base",
  frameThickness: "0.18",
  braceHalfWidth: "0.018",
  patchCenter: "0.50",
  patchWidth: "0.20",
  young: "210000000000",
  poisson: "0.3",
  samplingStrategy: "uniform",
  nDomain: "900",
  nBoundary: "160",
  epochs: "500",
  normalizeInputs: true,
  hiddenDim: "96",
  nHiddenLayers: "5",
  pdeWeight: "1.0",
  bcWeight: "5.0",
  residualResampleEvery: "200",
  fourierFeatures: false,
  fourierSigma: "1.0",
};

export function createPinnCell({ ui, runtimeState, shell }) {
  const state = {
    socket: null,
    isTraining: false,
    isPreviewing: false,
    previewTimer: null,
    currentCheckpointId: null,
    losses: {
      epoch: [],
      total: [],
      pde: [],
      bc: [],
    },
    latestMetrics: null,
    latestPreview: null,
    controls: null,
    femBaseline: null,
    activeBottomTab: "training-curve",
  };

  function getMergedPinnControls() {
    return { ...DEFAULT_PINN_CONTROLS, ...(runtimeState.pinn?.savedControls ?? {}) };
  }

  function capturePinnControlsToRuntime() {
    if (!state.controls?.geometry) {
      return;
    }
    if (!runtimeState.pinn) {
      runtimeState.pinn = {};
    }
    runtimeState.pinn.savedControls = {
      geometry: state.controls.geometry.value,
      frameThickness: state.controls.frameThickness.value,
      braceHalfWidth: state.controls.braceHalfWidth.value,
      patchCenter: state.controls.patchCenter.value,
      patchWidth: state.controls.patchWidth.value,
      young: state.controls.young.value,
      poisson: state.controls.poisson.value,
      samplingStrategy: state.controls.samplingStrategy.value,
      nDomain: state.controls.nDomain.value,
      nBoundary: state.controls.nBoundary.value,
      epochs: state.controls.epochs.value,
      normalizeInputs: state.controls.normalizeInputs.checked,
      hiddenDim: state.controls.hiddenDim.value,
      nHiddenLayers: state.controls.nHiddenLayers.value,
      pdeWeight: state.controls.pdeWeight.value,
      bcWeight: state.controls.bcWeight.value,
      residualResampleEvery: state.controls.residualResampleEvery.value,
      fourierFeatures: state.controls.fourierFeatures.checked,
      fourierSigma: state.controls.fourierSigma.value,
    };
  }

  function enter(checkpoint) {
    state.currentCheckpointId = checkpoint.id;
    renderControls(checkpoint);

    if (checkpoint.id === "pinn-compare") {
      renderCompareCheckpoint(checkpoint);
      return;
    }

    schedulePreview();
    renderPinnViews();
  }

  function leave() {
    capturePinnControlsToRuntime();
    if (state.previewTimer) {
      window.clearTimeout(state.previewTimer);
      state.previewTimer = null;
    }
    state.currentCheckpointId = null;
    closeSocket("Checkpoint changed");
    _destroyBottomTabs();
  }

  function _destroyBottomTabs() {
    const tabBar = document.getElementById("pinn-tab-loss-plot");
    if (!tabBar) return; // tabs were never injected
    // Purge any Plotly charts living in the sub-containers so Plotly's
    // internal registry doesn't hold stale references.
    for (const id of ["pinn-tab-loss-plot", "pinn-baseline-plot", "pinn-error-plot"]) {
      const el = document.getElementById(id);
      if (el && window.Plotly) {
        try { Plotly.purge(el); } catch (_) {}
      }
    }
    // Wipe the injected tab structure so the shared ui.bottomPlot container
    // is completely empty and ready for the next cell to use.
    const container = document.getElementById(ui.bottomPlot);
    if (container) container.innerHTML = "";
  }

  function renderControls(checkpoint) {
    const v = getMergedPinnControls();
    ui.controlsForm.innerHTML = `
      <details class="toggle-panel" open>
        <summary>Geometry and Load</summary>
        <div class="control-section-grid mt-4 lg:grid-cols-2">
          <div class="control-card">
            <label for="pinn-geometry" class="field-label">Geometry</label>
            <select id="pinn-geometry" class="field-input">
              <option value="base" ${v.geometry === "base" ? "selected" : ""}>Base Frame</option>
              <option value="diagonal" ${v.geometry === "diagonal" ? "selected" : ""}>Single Diagonal</option>
              <option value="x_brace" ${v.geometry === "x_brace" ? "selected" : ""}>X-Brace</option>
            </select>
            <p class="field-help">Pick the same frame layout used in the numerical cell.</p>
          </div>
          <div class="control-card">
            <div class="range-row">
              <label for="pinn-frame-thickness">Frame Thickness</label>
              <span id="pinn-frame-thickness-value" class="range-value"></span>
            </div>
            <input id="pinn-frame-thickness" type="range" min="0.10" max="0.32" step="0.01" value="${v.frameThickness}" class="field-range" />
            <p class="field-help">Use the same opening size you want the PINN to learn.</p>
          </div>
          <div class="control-card">
            <div class="range-row">
              <label for="pinn-brace-half-width">Brace Half Width</label>
              <span id="pinn-brace-half-width-value" class="range-value"></span>
            </div>
            <input id="pinn-brace-half-width" type="range" min="0.006" max="0.05" step="0.002" value="${v.braceHalfWidth}" class="field-range" />
            <p class="field-help">Brace width only matters for the reinforced geometries.</p>
          </div>
          <div class="control-card">
            <div class="range-row">
              <label for="pinn-patch-center">Patch Center (x)</label>
              <span id="pinn-patch-center-value" class="range-value"></span>
            </div>
            <input id="pinn-patch-center" type="range" min="0.15" max="0.85" step="0.01" value="${v.patchCenter}" class="field-range" />
            <p class="field-help">Slide the loaded top-edge patch left or right.</p>
          </div>
          <div class="control-card">
            <div class="range-row">
              <label for="pinn-patch-width">Patch Width</label>
              <span id="pinn-patch-width-value" class="range-value"></span>
            </div>
            <input id="pinn-patch-width" type="range" min="0.04" max="0.45" step="0.01" value="${v.patchWidth}" class="field-range" />
            <p class="field-help">A narrower patch makes the learned traction more localized.</p>
          </div>
        </div>
      </details>

      <details class="toggle-panel">
        <summary>Material Defaults</summary>
        <div class="control-section-grid mt-4 lg:grid-cols-2">
          <div class="control-card">
            <label for="pinn-young" class="field-label">Young's Modulus</label>
            <input id="pinn-young" type="number" value="${v.young}" step="1000000000" class="field-input" />
            <p class="field-help">Match the numerical material inputs; the PINN rescales them internally for training.</p>
          </div>
          <div class="control-card">
            <label for="pinn-poisson" class="field-label">Poisson Ratio</label>
            <input id="pinn-poisson" type="number" value="${v.poisson}" step="0.01" class="field-input" />
            <p class="field-help">Use the same lateral contraction ratio as the FEM baseline.</p>
          </div>
        </div>
      </details>

      <details class="toggle-panel" open>
        <summary>Sampling</summary>
        <div class="control-section-grid mt-4 lg:grid-cols-2">
          <div class="control-card">
            <label for="pinn-sampling-strategy" class="field-label">Sampling Strategy</label>
            <select id="pinn-sampling-strategy" class="field-input">
              <option value="uniform" ${v.samplingStrategy === "uniform" ? "selected" : ""}>Uniform</option>
              <option value="adaptive" ${v.samplingStrategy === "adaptive" ? "selected" : ""}>Adaptive</option>
            </select>
            <p class="field-help">Adaptive sampling adds more points near corners and brace joints.</p>
          </div>
          <div class="control-card">
            <div class="range-row">
              <label for="pinn-n-domain">Domain Points</label>
              <span id="pinn-n-domain-value" class="range-value"></span>
            </div>
            <input id="pinn-n-domain" type="range" min="100" max="3000" step="50" value="${v.nDomain}" class="field-range" />
            <p class="field-help">Interior points tell the PINN where to satisfy equilibrium.</p>
          </div>
          <div class="control-card">
            <div class="range-row">
              <label for="pinn-n-boundary">Boundary Points</label>
              <span id="pinn-n-boundary-value" class="range-value"></span>
            </div>
            <input id="pinn-n-boundary" type="range" min="16" max="600" step="8" value="${v.nBoundary}" class="field-range" />
            <p class="field-help">Boundary points teach the support and traction conditions.</p>
          </div>
          <div class="control-card lg:col-span-2">
            <div class="range-row">
              <label for="pinn-residual-resample-every">Residual Resample Every (epochs)</label>
              <span id="pinn-residual-resample-every-value" class="range-value"></span>
            </div>
            <input id="pinn-residual-resample-every" type="range" min="0" max="1000" step="50" value="${v.residualResampleEvery}" class="field-range" />
            <p class="field-help">Only used when the sampling strategy is <em>Adaptive</em>. Periodically replaces 70% of the interior points with new ones drawn where the equilibrium residual is largest. Set to 0 to disable.</p>
          </div>
        </div>
      </details>

      <details class="toggle-panel" ${checkpoint.id === "pinn-train" ? "open" : ""}>
        <summary>PINN and Training</summary>
        <div class="control-section-grid mt-4 lg:grid-cols-2">
          <div class="control-card">
            <div class="range-row">
              <label for="pinn-epochs">Epochs</label>
              <span id="pinn-epochs-value" class="range-value"></span>
            </div>
            <input id="pinn-epochs" type="range" min="50" max="5000" step="50" value="${v.epochs}" class="field-range" />
            <p class="field-help">Longer runs usually produce smoother loss and stress histories.</p>
          </div>
          <div class="control-card flex items-center justify-between gap-4">
            <div>
              <label for="pinn-normalize-inputs" class="text-sm font-medium text-slate-200">Input Normalization</label>
              <p class="text-xs text-slate-400">Maps coordinates to [-1, 1] before the PINN.</p>
            </div>
            <input id="pinn-normalize-inputs" type="checkbox" ${v.normalizeInputs ? "checked" : ""} class="h-5 w-5 rounded border-slate-600 bg-slate-800 text-cyan-400 focus:ring-cyan-400" />
          </div>
          <div class="control-card flex items-center justify-between gap-4">
            <div>
              <label for="pinn-fourier-features" class="text-sm font-medium text-slate-200">Fourier Features</label>
              <p class="text-xs text-slate-400">Random sin/cos input encoding to overcome the smooth-MLP spectral bias.</p>
            </div>
            <input id="pinn-fourier-features" type="checkbox" ${v.fourierFeatures ? "checked" : ""} class="h-5 w-5 rounded border-slate-600 bg-slate-800 text-cyan-400 focus:ring-cyan-400" />
          </div>
          <div class="control-card">
            <div class="range-row">
              <label for="pinn-fourier-sigma">Fourier Bandwidth (σ)</label>
              <span id="pinn-fourier-sigma-value" class="range-value"></span>
            </div>
            <input id="pinn-fourier-sigma" type="range" min="0.2" max="5.0" step="0.1" value="${v.fourierSigma}" class="field-range" />
            <p class="field-help">Frequency scale of the Fourier encoding. Small σ ≈ smooth field; large σ ≈ noisy field. Try 1–2 for stress problems.</p>
          </div>
          <div class="control-card">
            <div class="range-row">
              <label for="pinn-hidden-dim">Hidden Width</label>
              <span id="pinn-hidden-dim-value" class="range-value"></span>
            </div>
            <input id="pinn-hidden-dim" type="range" min="16" max="256" step="8" value="${v.hiddenDim}" class="field-range" />
            <p class="field-help">Wider layers increase capacity but also increase training cost.</p>
          </div>
          <div class="control-card">
            <div class="range-row">
              <label for="pinn-n-hidden-layers">Hidden Layers</label>
              <span id="pinn-n-hidden-layers-value" class="range-value"></span>
            </div>
            <input id="pinn-n-hidden-layers" type="range" min="2" max="8" step="1" value="${v.nHiddenLayers}" class="field-range" />
            <p class="field-help">More depth can fit harder fields, but may be slower to optimize.</p>
          </div>
        </div>
      </details>

      <details class="toggle-panel" ${checkpoint.id === "pinn-train" ? "open" : ""}>
        <summary>Loss Weighting and Run Control</summary>
        <div class="mt-4 space-y-4">
          <div class="control-section-grid lg:grid-cols-2">
            <div class="control-card">
              <div class="range-row">
                <label for="pinn-pde-weight">PDE Weight</label>
                <span id="pinn-pde-weight-value" class="range-value"></span>
              </div>
              <input id="pinn-pde-weight" type="range" min="0.2" max="10" step="0.1" value="${v.pdeWeight}" class="field-range" />
              <p class="field-help">Higher values emphasize interior equilibrium.</p>
            </div>
            <div class="control-card">
              <div class="range-row">
                <label for="pinn-bc-weight">BC Weight</label>
                <span id="pinn-bc-weight-value" class="range-value"></span>
              </div>
              <input id="pinn-bc-weight" type="range" min="0.2" max="10" step="0.1" value="${v.bcWeight}" class="field-range" />
              <p class="field-help">Higher values emphasize support and loading conditions.</p>
            </div>
          </div>
          ${
            checkpoint.id === "pinn-train"
              ? `
                <div class="grid gap-3 lg:grid-cols-2">
                  <button id="pinn-start-button" type="button" class="rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-slate-950 transition hover:bg-cyan-400">
                    Start Training
                  </button>
                  <button id="pinn-stop-button" type="button" class="rounded-xl border border-rose-500/70 bg-rose-500/10 px-4 py-3 font-semibold text-rose-200 transition hover:bg-rose-500/20" disabled>
                    Stop
                  </button>
                </div>
              `
              : `
                <div class="checkpoint-placeholder text-sm text-slate-300">
                  Training controls activate in the next PINN checkpoint. Use this preview stage to inspect collocation choices first.
                </div>
              `
          }
        </div>
      </details>
    `;

    state.controls = {
      geometry: ui.controlsForm.querySelector("#pinn-geometry"),
      frameThickness: ui.controlsForm.querySelector("#pinn-frame-thickness"),
      frameThicknessValue: ui.controlsForm.querySelector("#pinn-frame-thickness-value"),
      braceHalfWidth: ui.controlsForm.querySelector("#pinn-brace-half-width"),
      braceHalfWidthValue: ui.controlsForm.querySelector("#pinn-brace-half-width-value"),
      patchCenter: ui.controlsForm.querySelector("#pinn-patch-center"),
      patchCenterValue: ui.controlsForm.querySelector("#pinn-patch-center-value"),
      patchWidth: ui.controlsForm.querySelector("#pinn-patch-width"),
      patchWidthValue: ui.controlsForm.querySelector("#pinn-patch-width-value"),
      young: ui.controlsForm.querySelector("#pinn-young"),
      poisson: ui.controlsForm.querySelector("#pinn-poisson"),
      samplingStrategy: ui.controlsForm.querySelector("#pinn-sampling-strategy"),
      nDomain: ui.controlsForm.querySelector("#pinn-n-domain"),
      nBoundary: ui.controlsForm.querySelector("#pinn-n-boundary"),
      epochs: ui.controlsForm.querySelector("#pinn-epochs"),
      pdeWeight: ui.controlsForm.querySelector("#pinn-pde-weight"),
      bcWeight: ui.controlsForm.querySelector("#pinn-bc-weight"),
      hiddenDim: ui.controlsForm.querySelector("#pinn-hidden-dim"),
      nHiddenLayers: ui.controlsForm.querySelector("#pinn-n-hidden-layers"),
      residualResampleEvery: ui.controlsForm.querySelector("#pinn-residual-resample-every"),
      normalizeInputs: ui.controlsForm.querySelector("#pinn-normalize-inputs"),
      fourierFeatures: ui.controlsForm.querySelector("#pinn-fourier-features"),
      fourierSigma: ui.controlsForm.querySelector("#pinn-fourier-sigma"),
      startButton: ui.controlsForm.querySelector("#pinn-start-button"),
      stopButton: ui.controlsForm.querySelector("#pinn-stop-button"),
      valueLabels: {
        n_domain: ui.controlsForm.querySelector("#pinn-n-domain-value"),
        n_boundary: ui.controlsForm.querySelector("#pinn-n-boundary-value"),
        epochs: ui.controlsForm.querySelector("#pinn-epochs-value"),
        pde_weight: ui.controlsForm.querySelector("#pinn-pde-weight-value"),
        bc_weight: ui.controlsForm.querySelector("#pinn-bc-weight-value"),
        hidden_dim: ui.controlsForm.querySelector("#pinn-hidden-dim-value"),
        n_hidden_layers: ui.controlsForm.querySelector("#pinn-n-hidden-layers-value"),
        residual_resample_every: ui.controlsForm.querySelector("#pinn-residual-resample-every-value"),
        fourier_sigma: ui.controlsForm.querySelector("#pinn-fourier-sigma-value"),
      },
    };

    updateValueLabels();

    const controls = [
      state.controls.geometry,
      state.controls.frameThickness,
      state.controls.braceHalfWidth,
      state.controls.patchCenter,
      state.controls.patchWidth,
      state.controls.young,
      state.controls.poisson,
      state.controls.samplingStrategy,
      state.controls.nDomain,
      state.controls.nBoundary,
      state.controls.epochs,
      state.controls.pdeWeight,
      state.controls.bcWeight,
      state.controls.hiddenDim,
      state.controls.nHiddenLayers,
      state.controls.residualResampleEvery,
      state.controls.normalizeInputs,
      state.controls.fourierFeatures,
      state.controls.fourierSigma,
    ];

    controls.filter(Boolean).forEach((control) => {
      const eventName = control.tagName === "SELECT" ? "change" : "input";
      control.addEventListener(eventName, () => {
        updateValueLabels();
        schedulePreview();
      });
    });

    if (state.controls.startButton) {
      state.controls.startButton.addEventListener("click", startTraining);
    }
    if (state.controls.stopButton) {
      state.controls.stopButton.addEventListener("click", stopTraining);
    }
  }

  function updateValueLabels() {
    if (!state.controls?.valueLabels) {
      return;
    }
    state.controls.valueLabels.n_domain.textContent = state.controls.nDomain.value;
    state.controls.valueLabels.n_boundary.textContent = state.controls.nBoundary.value;
    state.controls.frameThicknessValue.textContent = Number(state.controls.frameThickness.value).toFixed(2);
    state.controls.braceHalfWidthValue.textContent = Number(state.controls.braceHalfWidth.value).toFixed(3);
    state.controls.patchCenterValue.textContent = Number(state.controls.patchCenter.value).toFixed(2);
    state.controls.patchWidthValue.textContent = Number(state.controls.patchWidth.value).toFixed(2);
    state.controls.valueLabels.epochs.textContent = state.controls.epochs.value;
    state.controls.valueLabels.pde_weight.textContent = Number(state.controls.pdeWeight.value).toFixed(1);
    state.controls.valueLabels.bc_weight.textContent = Number(state.controls.bcWeight.value).toFixed(1);
    state.controls.valueLabels.hidden_dim.textContent = state.controls.hiddenDim.value;
    state.controls.valueLabels.n_hidden_layers.textContent = state.controls.nHiddenLayers.value;
    if (state.controls.valueLabels.residual_resample_every) {
      const v = Number(state.controls.residualResampleEvery.value);
      state.controls.valueLabels.residual_resample_every.textContent = v === 0 ? "off" : String(v);
    }
    if (state.controls.valueLabels.fourier_sigma) {
      state.controls.valueLabels.fourier_sigma.textContent = Number(state.controls.fourierSigma.value).toFixed(1);
    }
  }

  function getConfig() {
    return {
      problem: {
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
      },
      sampling_strategy: state.controls.samplingStrategy.value,
      n_domain: Number(state.controls.nDomain.value),
      n_boundary: Number(state.controls.nBoundary.value),
      epochs: Number(state.controls.epochs.value),
      normalize_inputs: state.controls.normalizeInputs.checked,
      pde_weight: Number(state.controls.pdeWeight.value),
      bc_weight: Number(state.controls.bcWeight.value),
      hidden_dim: Number(state.controls.hiddenDim.value),
      n_hidden_layers: Number(state.controls.nHiddenLayers.value),
      residual_resample_every: Number(state.controls.residualResampleEvery.value),
      fourier_features: state.controls.fourierFeatures.checked,
      fourier_sigma: Number(state.controls.fourierSigma.value),
      learning_rate: 0.001,
      update_every: 50,
      stress_grid_n: 60,
      seed: 0,
    };
  }

  function schedulePreview() {
    if (state.isTraining) {
      shell.setStatus("Training is using the current PINN setup", {
        tone: "running",
        detail: "Finish or stop the run before requesting a fresh preview from new controls.",
      });
      updateGuide();
      return;
    }
    state.isPreviewing = true;
    shell.setStatus("Refreshing PINN preview", {
      tone: "preview",
      detail: "Collocation points update automatically while you tune the shared structural case or the PINN sampling controls.",
    });
    shell.setControlsSummary(
      state.currentCheckpointId === "pinn-train"
        ? "Tune geometry or loss weighting here, then launch a training run when the collocation looks reasonable."
        : "Use this preview step to understand the collocation cloud before training.",
    );
    if (state.previewTimer) {
      window.clearTimeout(state.previewTimer);
    }
    state.previewTimer = window.setTimeout(fetchPreview, 120);
    updateGuide();
  }

  async function fetchPreview() {
    try {
      const payload = await fetchPinnPreview(getConfig());
      state.isPreviewing = false;
      state.latestPreview = payload;
      runtimeState.pinn.latestPreview = payload;
      runtimeState.checkpointEvents["pinn-preview"] = {
        status: "success",
        points: payload.counts.n_domain,
        caseId: payload.case_id,
      };
      if (!["pinn-preview", "pinn-train"].includes(state.currentCheckpointId)) {
        return;
      }
      renderPinnViews();
      if (!state.isTraining) {
        shell.setStatus("PINN preview ready", {
          tone: "success",
          detail: `Case ${payload.case_id} has ${payload.counts.n_domain} domain points and ${payload.counts.n_boundary} boundary points ready to inspect.`,
        });
        updateGuide();
      }
    } catch (error) {
      state.isPreviewing = false;
      shell.setStatus("PINN preview failed", {
        tone: "error",
        detail: "The preview request did not complete successfully.",
      });
      shell.setGuideSections([
        {
          title: "What to do next",
          items: ["Check the current inputs and try the preview again.", String(error)],
        },
      ]);
      renderNotePlot(ui.bottomPlot, "Preview Error", [String(error)]);
    }
  }

  function renderPinnViews() {
    if (state.latestPreview) {
      renderPointCloudPlot(ui.leftPlot, state.latestPreview);
      const activeTab = state.activeBottomTab;
      shell.setPlotMeta({
        leftTitle: "Collocation Points",
        leftSummary: `${state.latestPreview.counts.n_domain} domain, ${state.latestPreview.counts.n_boundary} boundary`,
        rightTitle: "Von Mises Stress",
        rightSummary: state.latestMetrics
          ? `Updated at epoch ${state.latestMetrics.epoch}`
          : state.currentCheckpointId === "pinn-train"
            ? "Training not started yet"
            : "Appears during training",
        bottomTitle: state.currentCheckpointId === "pinn-train"
          ? (activeTab === "compare-fem" ? "Compare with Numerical" : "Training Curves")
          : "Preview Notes",
        bottomSummary: state.currentCheckpointId === "pinn-train"
          ? (state.latestMetrics ? `Epoch ${state.latestMetrics.epoch}` : "Waiting for a training run")
          : "Inspect the collocation design first",
      });
    } else {
      renderNotePlot(ui.leftPlot, "Collocation preview", [
        "Choose geometry and sampling settings to generate the first PINN preview.",
      ]);
    }

    if (state.currentCheckpointId === "pinn-train") {
      if (state.latestMetrics?.stress_grid) {
        renderStressHeatmap(ui.rightPlot, state.latestMetrics.stress_grid);
      } else {
        renderNotePlot(ui.rightPlot, "Von Mises stress", [
          "Start a training run to populate the live stress heatmap.",
        ]);
      }
      _renderBottomTabs();
      return;
    }

    renderNotePlot(ui.rightPlot, "Training output", [
      "The stress heatmap becomes active in the PINN training checkpoint.",
      "Use this preview stage to focus on geometry and collocation.",
    ]);
    renderNotePlot(ui.bottomPlot, "Preview checkpoint", [
      "Collocation preview is live.",
      "Training controls unlock in the next PINN checkpoint.",
    ]);
  }

  function _ensureBottomTabs() {
    if (document.getElementById("pinn-tab-loss-plot")) return;
    const container = document.getElementById(ui.bottomPlot);
    if (!container) return;
    container.innerHTML = `
      <div style="display:flex; flex-direction:column; height:100%; min-height:0;">
        <div id="pinn-tab-bar" style="
          display:flex; gap:0; flex-shrink:0;
          border-bottom: 1px solid rgba(148,163,184,0.2);
          margin-bottom:4px;
        ">
          <button id="pinn-tab-btn-training-curve" type="button" style="
            padding:6px 16px; font-size:0.8rem; font-weight:600;
            border:none; border-radius:6px 6px 0 0; cursor:pointer;
            transition:background 0.15s, color 0.15s;
          ">Training Curve</button>
          <button id="pinn-tab-btn-compare-fem" type="button" style="
            padding:6px 16px; font-size:0.8rem; font-weight:600;
            border:none; border-radius:6px 6px 0 0; cursor:pointer;
            transition:background 0.15s, color 0.15s;
          ">Compare with Numerical</button>
        </div>
        <div id="pinn-tab-loss-plot" style="flex:1; min-height:0;"></div>
        <div id="pinn-tab-compare-content" style="
          display:none; flex:1; min-height:0; flex-direction:row;
        ">
          <div id="pinn-baseline-plot" style="flex:1; min-height:0; min-width:0;"></div>
          <div id="pinn-error-plot"    style="flex:1; min-height:0; min-width:0;"></div>
        </div>
      </div>`;
    document.getElementById("pinn-tab-btn-training-curve").addEventListener("click", () => {
      state.activeBottomTab = "training-curve";
      _renderBottomTabs();
    });
    document.getElementById("pinn-tab-btn-compare-fem").addEventListener("click", () => {
      state.activeBottomTab = "compare-fem";
      _renderBottomTabs();
    });
  }

  function _updateTabButtons() {
    const btnLoss    = document.getElementById("pinn-tab-btn-training-curve");
    const btnCompare = document.getElementById("pinn-tab-btn-compare-fem");
    if (!btnLoss || !btnCompare) return;
    const baseStyle = "padding:6px 16px; font-size:0.8rem; font-weight:600; border:none; border-radius:6px 6px 0 0; cursor:pointer; transition:background 0.15s, color 0.15s;";
    const activeStyle = baseStyle + "background:rgba(34,211,238,0.15); color:#22d3ee;";
    const idleStyle   = baseStyle + "background:transparent; color:#94a3b8;";
    btnLoss.setAttribute("style",    state.activeBottomTab === "training-curve" ? activeStyle : idleStyle);
    btnCompare.setAttribute("style", state.activeBottomTab === "compare-fem"    ? activeStyle : idleStyle);
  }

  function _renderBottomTabs() {
    _ensureBottomTabs();
    _updateTabButtons();

    const lossPane    = document.getElementById("pinn-tab-loss-plot");
    const comparePane = document.getElementById("pinn-tab-compare-content");
    if (!lossPane || !comparePane) return;

    if (state.activeBottomTab === "compare-fem") {
      lossPane.style.display    = "none";
      comparePane.style.display = "flex";
      // Left: FEM baseline
      if (state.femBaseline) {
        renderStressHeatmap("pinn-baseline-plot", state.femBaseline);
      } else {
        renderNotePlot("pinn-baseline-plot", "FEM Baseline", [
          "Running FEM at highest resolution\u2026",
          "The baseline will appear here shortly after training starts.",
        ]);
      }
      // Right: absolute error (updates every update_every epochs)
      if (state.latestMetrics?.error_grid) {
        renderErrorHeatmap("pinn-error-plot", state.latestMetrics.error_grid);
      } else {
        renderNotePlot("pinn-error-plot", "Absolute Error", [
          "Error map appears here once PINN metrics and FEM baseline are both available.",
        ]);
      }
    } else {
      lossPane.style.display    = "flex";
      comparePane.style.display = "none";
      if (state.losses.epoch.length === 0) {
        renderNotePlot("pinn-tab-loss-plot", "Training Curves", [
          "A completed or in-progress training run will populate this plot.",
        ]);
      } else {
        renderLossPlot("pinn-tab-loss-plot", state.losses);
      }
    }
  }

  function resetLosses() {
    state.losses = { epoch: [], total: [], pde: [], bc: [] };
  }

  function setTrainingState(isTraining) {
    state.isTraining = isTraining;
    if (state.controls?.startButton) {
      state.controls.startButton.disabled = isTraining;
      state.controls.startButton.classList.toggle("opacity-60", isTraining);
      state.controls.startButton.classList.toggle("cursor-not-allowed", isTraining);
    }
    if (state.controls?.stopButton) {
      state.controls.stopButton.disabled = !isTraining;
      state.controls.stopButton.classList.toggle("opacity-60", !isTraining);
    }
  }

  function startTraining() {
    closeSocket();
    if (state.previewTimer) {
      window.clearTimeout(state.previewTimer);
      state.previewTimer = null;
    }
    state.isPreviewing = false;
    resetLosses();
    state.latestMetrics = null;
    state.femBaseline = null;
    renderPinnViews();
    setTrainingState(true);
    shell.setStatus("Connecting to PINN training", {
      tone: "running",
      detail: "Opening the live training session and preparing the first preview.",
    });
    updateGuide();

    const socket = createPinnSocket();
    state.socket = socket;

    socket.addEventListener("open", () => {
      shell.setStatus("Training PINN", {
        tone: "running",
        detail: "The model is now training on the shared bottom-support and top-traction case for this setup.",
      });
      socket.send(JSON.stringify({ type: "start", payload: getConfig() }));
    });

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);

      if (message.type === "session") {
        shell.setStatus("Training session ready", {
          tone: "running",
          detail: `Running on ${message.device}. Watch the loss curves and stress map update below.`,
        });
        return;
      }
      if (message.type === "preview") {
        state.latestPreview = message;
        runtimeState.pinn.latestPreview = message;
        renderPinnViews();
        updateGuide();
        return;
      }
      if (message.type === "fem_baseline") {
        state.femBaseline = message.stress_grid;
        renderPinnViews();
        return;
      }
      if (message.type === "resample") {
        // Residual-adaptive resampling produced a new collocation cloud.
        // Update the cached preview so the "Collocation Points" plot reflects
        // the points the model is currently training on.
        if (state.latestPreview && message.domain_points) {
          const updated = {
            ...state.latestPreview,
            domain_points: message.domain_points,
            counts: {
              ...state.latestPreview.counts,
              n_domain: message.n_points,
            },
          };
          state.latestPreview = updated;
          runtimeState.pinn.latestPreview = updated;
          renderPinnViews();
        }
        return;
      }
      if (message.type === "metrics") {
        state.losses = {
          epoch: [...state.losses.epoch, message.epoch],
          total: [...state.losses.total, message.total_loss],
          pde: [...state.losses.pde, message.pde_loss],
          bc: [...state.losses.bc, message.bc_loss],
        };
        state.latestMetrics = message;
        runtimeState.pinn.latestMetrics = message;
        runtimeState.checkpointEvents["pinn-train"] = {
          status: "running",
          epoch: message.epoch,
          totalLoss: message.total_loss,
        };
        shell.setStatus("PINN training in progress", {
          tone: "running",
          detail: `Epoch ${message.epoch} \u00b7 total loss ${formatMetric(message.total_loss)}`,
        });
        renderPinnViews();
        updateGuide();
        return;
      }
      if (message.type === "complete") {
        setTrainingState(false);
        runtimeState.checkpointEvents["pinn-train"] = {
          status: "success",
          epoch: message.epoch,
          bestTotalLoss: message.best_total_loss,
        };
        shell.setStatus(message.status === "stopped" ? "PINN training stopped" : "PINN training completed", {
          tone: message.status === "stopped" ? "warning" : "success",
          detail:
            message.status === "stopped"
              ? "The last streamed state remains visible for inspection."
              : `Best total loss ${formatMetric(message.best_total_loss)} at epoch ${message.epoch}.`,
        });
        updateGuide();
        socket.close();
        return;
      }
      if (message.type === "error") {
        setTrainingState(false);
        runtimeState.checkpointEvents["pinn-train"] = {
          status: "error",
          message: message.message,
        };
        shell.setStatus("PINN server error", {
          tone: "error",
          detail: "The live training session ended with an error from the backend.",
        });
        shell.setGuideSections([
          {
            title: "What to do next",
            items: ["Review the error below, then retry with a simpler setup if needed.", message.message],
          },
        ]);
        socket.close();
      }
    });

    socket.addEventListener("close", () => {
      if (state.socket === socket) {
        state.socket = null;
      }
      if (state.isTraining) {
        setTrainingState(false);
        shell.setStatus("PINN training disconnected", {
          tone: "error",
          detail: "The WebSocket session closed before training completed.",
        });
      }
    });

    socket.addEventListener("error", () => {
      setTrainingState(false);
      shell.setStatus("PINN connection failed", {
        tone: "error",
        detail: "The browser could not establish the live training connection.",
      });
    });
  }

  function stopTraining() {
    if (!state.socket) {
      return;
    }
    shell.setStatus("Stopping PINN training", {
      tone: "warning",
      detail: "Waiting for the training session to acknowledge the stop request.",
    });
    try {
      state.socket.send(JSON.stringify({ type: "stop" }));
    } catch (_error) {
      closeSocket("PINN training stopped");
    }
  }

  function closeSocket(statusText = null) {
    if (state.socket) {
      try {
        state.socket.close();
      } catch (_error) {
        // no-op
      }
      state.socket = null;
    }
    setTrainingState(false);
    if (statusText) {
      shell.setStatus(statusText, {
        tone: "idle",
        detail: "Use the controls to preview a new setup or start another run.",
      });
    }
  }

  function updateGuide() {
    if (!state.controls) {
      return;
    }

    const config = getConfig();
    const notice = [];
    const tryNext = [];
    const why = [];

    if (!config.normalize_inputs) {
      notice.push("Normalization is off, which usually makes optimization less stable.");
    }
    if (config.n_domain < 400) {
      notice.push("Domain density is low, so the interior field may look patchy or misleading.");
    }
    if (config.n_boundary < 80) {
      notice.push("Boundary sampling is sparse, so supports and loading may be learned less reliably.");
    }
    if (config.sampling_strategy === "adaptive") {
      notice.push("Adaptive sampling concentrates more points near corners and brace joints.");
    }
    if (config.problem.geometry.geometry === "diagonal") {
      notice.push("A single diagonal brace creates one alternate load path across the opening.");
    }
    if (config.problem.geometry.geometry === "x_brace") {
      notice.push("The X-brace is usually the stiffest reinforcement in this geometry set.");
    }
    if (config.problem.load.patch_width < 0.1) {
      notice.push("The traction patch is narrow, so the learned stress field should become more localized near the top edge.");
    }
    if (config.problem.geometry.frame_thickness > 0.26) {
      notice.push("A thicker frame leaves a smaller opening, which can reduce the visible effect of reinforcement changes.");
    }
    if (config.pde_weight < 0.8) {
      tryNext.push("Raise PDE weight if the model fits the boundary but struggles inside the domain.");
    }
    if (config.bc_weight < 1.0) {
      tryNext.push("Raise BC weight if support or loading conditions look poorly enforced.");
    }

    if (state.latestMetrics) {
      const { total_loss: totalLoss, pde_loss: pdeLoss, bc_loss: bcLoss } = state.latestMetrics;
      if (totalLoss > 5) {
        notice.push("Total loss is still high, so the PINN has not settled yet.");
      }
      if (bcLoss > pdeLoss * 2) {
        notice.push("Boundary loss dominates, so the supports or loading are harder than the interior PDE right now.");
      }
      if (pdeLoss > bcLoss * 2) {
        notice.push("Physics loss dominates, so equilibrium is the harder part of the problem right now.");
      }
      why.push(`Latest loss snapshot: total ${formatMetric(totalLoss)}, PDE ${formatMetric(pdeLoss)}, BC ${formatMetric(bcLoss)}.`);
    }

    if (state.currentCheckpointId === "pinn-preview") {
      notice.push("This step is for understanding the point cloud before you train.");
      tryNext.push("Compare uniform and adaptive sampling before moving on.");
      why.push("Seeing the collocation cloud first makes it easier to judge whether the PINN is sampling the same structural case as the numerical baseline.");
    } else if (state.isTraining) {
      tryNext.push("Let the run progress for a few epochs before judging the stress map.");
      why.push("The live curves show whether the PINN is balancing equilibrium with the shared support and traction boundary conditions.");
    } else if (state.currentCheckpointId === "pinn-train") {
      tryNext.push("Change one setting at a time, then start another run to see what moved the curves.");
      why.push("Short, repeated experiments help students learn which settings change convergence.");
    }

    if (!notice.length) {
      notice.push("This setup is balanced enough to begin a teaching run.");
    }

    if (!why.length) {
      why.push("The goal is not only to train a PINN, but to judge when its answer is believable.");
    }

    shell.setGuideSections([
      { title: "What to notice", items: notice.slice(0, 3) },
      { title: "What to try", items: tryNext.slice(0, 2) },
      { title: "Why it matters", items: why.slice(0, 2) },
    ]);
  }

  function renderCompareCheckpoint(checkpoint) {
    const femCaseId = runtimeState.fem.latestPreview?.case_id;
    const latestEpoch = runtimeState.pinn.latestMetrics?.epoch;

    renderNotePlot(ui.leftPlot, "FEM Reference", [
      femCaseId ? `Latest numerical case: ${femCaseId}` : "No numerical case is available yet.",
      "This panel can later host the FEM field used for comparison.",
    ]);
    renderNotePlot(ui.rightPlot, "PINN Reference", [
      latestEpoch ? `Latest PINN epoch: ${latestEpoch}` : "No PINN training metrics are available yet.",
      "This panel can later host the matching PINN field.",
    ]);
    renderNotePlot(ui.bottomPlot, "Comparison Step", [
      "This stage is reserved for a later FEM-versus-PINN comparison view.",
      "The shell is already laid out so that comparison can be added without changing the learning flow.",
    ]);

    shell.setPlotMeta({
      leftTitle: "FEM Reference",
      leftSummary: femCaseId ? femCaseId : "Waiting for numerical data",
      rightTitle: "PINN Reference",
      rightSummary: latestEpoch ? `Epoch ${latestEpoch}` : "Waiting for PINN data",
      bottomTitle: "Comparison Checkpoint",
      bottomSummary: "Reserved for future work",
    });
    shell.setControlsSummary(checkpoint.controlsSubtitle);
    shell.setStatus("Comparison checkpoint active", {
      tone: "idle",
      detail: "This shell region is reserved for a future side-by-side validation step.",
    });
    shell.setGuideSections([
      {
        title: "What to notice",
        items: ["Both the numerical and PINN cells now flow into a future comparison landing zone."],
      },
      {
        title: "Why it matters",
        items: ["Keeping a comparison checkpoint in the sequence reinforces that PINN results should be checked against a trusted baseline."],
      },
    ]);
  }

  return {
    enter,
    leave,
  };
}

function formatMetric(value) {
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  if (Math.abs(value) >= 1000 || (Math.abs(value) > 0 && Math.abs(value) < 1e-3)) {
    return value.toExponential(2);
  }
  return value.toFixed(3);
}
