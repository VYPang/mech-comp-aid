import { createPinnSocket, fetchPinnPreview } from "./api.js?v=checkpoint-shell-5";
import { renderLossPlot, renderNotePlot, renderPointCloudPlot, renderStressHeatmap } from "./plots.js?v=checkpoint-shell-5";

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
  };

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
    if (state.previewTimer) {
      window.clearTimeout(state.previewTimer);
      state.previewTimer = null;
    }
    state.currentCheckpointId = null;
    closeSocket("Checkpoint changed");
  }

  function renderControls(checkpoint) {
    ui.controlsForm.innerHTML = `
      <details class="toggle-panel" open>
        <summary>Geometry and Sampling</summary>
        <div class="control-section-grid mt-4 lg:grid-cols-2">
          <div class="control-card">
            <label for="pinn-geometry" class="field-label">Geometry</label>
            <select id="pinn-geometry" class="field-input">
              <option value="base">Base Frame</option>
              <option value="diagonal">Single Diagonal</option>
              <option value="x_brace">X-Brace</option>
            </select>
            <p class="field-help">Match this with the numerical case you want to compare against later.</p>
          </div>
          <div class="control-card">
            <label for="pinn-sampling-strategy" class="field-label">Sampling Strategy</label>
            <select id="pinn-sampling-strategy" class="field-input">
              <option value="uniform">Uniform</option>
              <option value="adaptive">Adaptive</option>
            </select>
            <p class="field-help">Adaptive sampling adds more points near likely stress hot spots.</p>
          </div>
          <div class="control-card">
            <div class="range-row">
              <label for="pinn-n-domain">Domain Points</label>
              <span id="pinn-n-domain-value" class="range-value">900</span>
            </div>
            <input id="pinn-n-domain" type="range" min="100" max="3000" step="50" value="900" class="field-range" />
            <p class="field-help">Interior points tell the PINN where to satisfy the PDE.</p>
          </div>
          <div class="control-card">
            <div class="range-row">
              <label for="pinn-n-boundary">Boundary Points</label>
              <span id="pinn-n-boundary-value" class="range-value">160</span>
            </div>
            <input id="pinn-n-boundary" type="range" min="16" max="600" step="8" value="160" class="field-range" />
            <p class="field-help">Boundary points help the model learn supports and loading conditions.</p>
          </div>
        </div>
      </details>

      <details class="toggle-panel" ${checkpoint.id === "pinn-train" ? "open" : ""}>
        <summary>PINN and Training</summary>
        <div class="control-section-grid mt-4 lg:grid-cols-2">
          <div class="control-card">
            <div class="range-row">
              <label for="pinn-epochs">Epochs</label>
              <span id="pinn-epochs-value" class="range-value">500</span>
            </div>
            <input id="pinn-epochs" type="range" min="50" max="1200" step="50" value="500" class="field-range" />
            <p class="field-help">Longer runs usually produce smoother loss and stress histories.</p>
          </div>
          <div class="control-card flex items-center justify-between gap-4">
            <div>
              <label for="pinn-normalize-inputs" class="text-sm font-medium text-slate-200">Input Normalization</label>
              <p class="text-xs text-slate-400">Maps coordinates to [-1, 1] before the PINN.</p>
            </div>
            <input id="pinn-normalize-inputs" type="checkbox" checked class="h-5 w-5 rounded border-slate-600 bg-slate-800 text-cyan-400 focus:ring-cyan-400" />
          </div>
          <div class="control-card">
            <div class="range-row">
              <label for="pinn-hidden-dim">Hidden Width</label>
              <span id="pinn-hidden-dim-value" class="range-value">48</span>
            </div>
            <input id="pinn-hidden-dim" type="range" min="16" max="128" step="8" value="48" class="field-range" />
            <p class="field-help">Wider layers increase capacity but also increase training cost.</p>
          </div>
          <div class="control-card">
            <div class="range-row">
              <label for="pinn-n-hidden-layers">Hidden Layers</label>
              <span id="pinn-n-hidden-layers-value" class="range-value">4</span>
            </div>
            <input id="pinn-n-hidden-layers" type="range" min="2" max="6" step="1" value="4" class="field-range" />
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
                <span id="pinn-pde-weight-value" class="range-value">1.0</span>
              </div>
              <input id="pinn-pde-weight" type="range" min="0.2" max="10" step="0.1" value="1.0" class="field-range" />
              <p class="field-help">Higher values emphasize interior equilibrium.</p>
            </div>
            <div class="control-card">
              <div class="range-row">
                <label for="pinn-bc-weight">BC Weight</label>
                <span id="pinn-bc-weight-value" class="range-value">5.0</span>
              </div>
              <input id="pinn-bc-weight" type="range" min="0.2" max="10" step="0.1" value="5.0" class="field-range" />
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
      samplingStrategy: ui.controlsForm.querySelector("#pinn-sampling-strategy"),
      nDomain: ui.controlsForm.querySelector("#pinn-n-domain"),
      nBoundary: ui.controlsForm.querySelector("#pinn-n-boundary"),
      epochs: ui.controlsForm.querySelector("#pinn-epochs"),
      pdeWeight: ui.controlsForm.querySelector("#pinn-pde-weight"),
      bcWeight: ui.controlsForm.querySelector("#pinn-bc-weight"),
      hiddenDim: ui.controlsForm.querySelector("#pinn-hidden-dim"),
      nHiddenLayers: ui.controlsForm.querySelector("#pinn-n-hidden-layers"),
      normalizeInputs: ui.controlsForm.querySelector("#pinn-normalize-inputs"),
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
      },
    };

    updateValueLabels();

    const controls = [
      state.controls.geometry,
      state.controls.samplingStrategy,
      state.controls.nDomain,
      state.controls.nBoundary,
      state.controls.epochs,
      state.controls.pdeWeight,
      state.controls.bcWeight,
      state.controls.hiddenDim,
      state.controls.nHiddenLayers,
      state.controls.normalizeInputs,
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
    state.controls.valueLabels.epochs.textContent = state.controls.epochs.value;
    state.controls.valueLabels.pde_weight.textContent = Number(state.controls.pdeWeight.value).toFixed(1);
    state.controls.valueLabels.bc_weight.textContent = Number(state.controls.bcWeight.value).toFixed(1);
    state.controls.valueLabels.hidden_dim.textContent = state.controls.hiddenDim.value;
    state.controls.valueLabels.n_hidden_layers.textContent = state.controls.nHiddenLayers.value;
  }

  function getConfig() {
    return {
      geometry: state.controls.geometry.value,
      sampling_strategy: state.controls.samplingStrategy.value,
      n_domain: Number(state.controls.nDomain.value),
      n_boundary: Number(state.controls.nBoundary.value),
      epochs: Number(state.controls.epochs.value),
      normalize_inputs: state.controls.normalizeInputs.checked,
      pde_weight: Number(state.controls.pdeWeight.value),
      bc_weight: Number(state.controls.bcWeight.value),
      hidden_dim: Number(state.controls.hiddenDim.value),
      n_hidden_layers: Number(state.controls.nHiddenLayers.value),
      learning_rate: 0.001,
      update_every: 50,
      stress_grid_n: 40,
      seed: 0,
      load_displacement: 0.02,
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
      detail: "Collocation points update automatically while you tune geometry, density, or loss weights.",
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
      };
      if (!["pinn-preview", "pinn-train"].includes(state.currentCheckpointId)) {
        return;
      }
      renderPinnViews();
      if (!state.isTraining) {
        shell.setStatus("PINN preview ready", {
          tone: "success",
          detail: `${payload.counts.n_domain} domain points and ${payload.counts.n_boundary} boundary points are ready to inspect.`,
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
      shell.setPlotMeta({
        leftTitle: "Collocation Points",
        leftSummary: `${state.latestPreview.counts.n_domain} domain, ${state.latestPreview.counts.n_boundary} boundary`,
        rightTitle: "Von Mises Stress",
        rightSummary: state.latestMetrics
          ? `Updated at epoch ${state.latestMetrics.epoch}`
          : state.currentCheckpointId === "pinn-train"
            ? "Training not started yet"
            : "Appears during training",
        bottomTitle: state.currentCheckpointId === "pinn-train" ? "Training Curves" : "Preview Notes",
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
      if (state.losses.epoch.length === 0) {
        renderNotePlot(ui.bottomPlot, "Training Curves", [
          "A completed or in-progress training run will populate this plot.",
        ]);
      } else {
        renderLossPlot(ui.bottomPlot, state.losses);
      }
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
        detail: "The model is now streaming previews, metrics, and final status over the live session.",
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
    if (config.geometry === "diagonal") {
      notice.push("A single diagonal brace creates one alternate load path across the opening.");
    }
    if (config.geometry === "x_brace") {
      notice.push("The X-brace is usually the stiffest reinforcement in this geometry set.");
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
      why.push("Seeing the collocation cloud first makes the later stress map easier to interpret.");
    } else if (state.isTraining) {
      tryNext.push("Let the run progress for a few epochs before judging the stress map.");
      why.push("The live curves show whether the PINN is balancing physics and boundary conditions.");
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
