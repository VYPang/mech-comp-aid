import { createPinnSocket, fetchPinnPreview } from "./api.js";
import { renderLossPlot, renderNotePlot, renderPointCloudPlot, renderStressHeatmap } from "./plots.js";

export function createPinnCell({ ui, runtimeState, shell }) {
  const state = {
    socket: null,
    isTraining: false,
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
        <div class="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <label for="pinn-geometry" class="field-label">Geometry</label>
            <select id="pinn-geometry" class="field-input">
              <option value="base">Base Frame</option>
              <option value="diagonal">Single Diagonal</option>
              <option value="x_brace">X-Brace</option>
            </select>
          </div>
          <div>
            <label for="pinn-sampling-strategy" class="field-label">Sampling Strategy</label>
            <select id="pinn-sampling-strategy" class="field-input">
              <option value="uniform">Uniform</option>
              <option value="adaptive">Adaptive</option>
            </select>
          </div>
          <div>
            <div class="mb-1 flex items-center justify-between text-sm">
              <label for="pinn-n-domain" class="font-medium text-slate-200">Domain Points</label>
              <span id="pinn-n-domain-value" class="text-cyan-300">900</span>
            </div>
            <input id="pinn-n-domain" type="range" min="100" max="3000" step="50" value="900" class="field-range" />
          </div>
          <div>
            <div class="mb-1 flex items-center justify-between text-sm">
              <label for="pinn-n-boundary" class="font-medium text-slate-200">Boundary Points</label>
              <span id="pinn-n-boundary-value" class="text-cyan-300">160</span>
            </div>
            <input id="pinn-n-boundary" type="range" min="16" max="600" step="8" value="160" class="field-range" />
          </div>
        </div>
      </details>

      <details class="toggle-panel" ${checkpoint.id === "pinn-train" ? "open" : ""}>
        <summary>PINN and Training</summary>
        <div class="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <div class="mb-1 flex items-center justify-between text-sm">
              <label for="pinn-epochs" class="font-medium text-slate-200">Epochs</label>
              <span id="pinn-epochs-value" class="text-cyan-300">500</span>
            </div>
            <input id="pinn-epochs" type="range" min="50" max="1200" step="50" value="500" class="field-range" />
          </div>
          <div class="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2.5">
            <div>
              <label for="pinn-normalize-inputs" class="text-sm font-medium text-slate-200">Input Normalization</label>
              <p class="text-xs text-slate-400">Maps coordinates to [-1, 1] before the PINN.</p>
            </div>
            <input id="pinn-normalize-inputs" type="checkbox" checked class="h-5 w-5 rounded border-slate-600 bg-slate-800 text-cyan-400 focus:ring-cyan-400" />
          </div>
          <div>
            <div class="mb-1 flex items-center justify-between text-sm">
              <label for="pinn-hidden-dim" class="font-medium text-slate-200">Hidden Width</label>
              <span id="pinn-hidden-dim-value" class="text-cyan-300">48</span>
            </div>
            <input id="pinn-hidden-dim" type="range" min="16" max="128" step="8" value="48" class="field-range" />
          </div>
          <div>
            <div class="mb-1 flex items-center justify-between text-sm">
              <label for="pinn-n-hidden-layers" class="font-medium text-slate-200">Hidden Layers</label>
              <span id="pinn-n-hidden-layers-value" class="text-cyan-300">4</span>
            </div>
            <input id="pinn-n-hidden-layers" type="range" min="2" max="6" step="1" value="4" class="field-range" />
          </div>
        </div>
      </details>

      <details class="toggle-panel" ${checkpoint.id === "pinn-train" ? "open" : ""}>
        <summary>Loss Weighting and Run Control</summary>
        <div class="mt-4 space-y-4">
          <div class="grid gap-4 lg:grid-cols-2">
            <div>
              <div class="mb-1 flex items-center justify-between text-sm">
                <label for="pinn-pde-weight" class="font-medium text-slate-200">PDE Weight</label>
                <span id="pinn-pde-weight-value" class="text-cyan-300">1.0</span>
              </div>
              <input id="pinn-pde-weight" type="range" min="0.2" max="10" step="0.1" value="1.0" class="field-range" />
            </div>
            <div>
              <div class="mb-1 flex items-center justify-between text-sm">
                <label for="pinn-bc-weight" class="font-medium text-slate-200">BC Weight</label>
                <span id="pinn-bc-weight-value" class="text-cyan-300">5.0</span>
              </div>
              <input id="pinn-bc-weight" type="range" min="0.2" max="10" step="0.1" value="5.0" class="field-range" />
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
      control.addEventListener("input", () => {
        updateValueLabels();
        schedulePreview();
      });
      control.addEventListener("change", () => {
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
      updateGuide();
      return;
    }
    shell.setControlsSummary(
      state.currentCheckpointId === "pinn-train"
        ? "PINN preview updates remain live while you adjust geometry or loss settings before the next training run."
        : "Use this checkpoint to inspect collocation before starting the PINN training stage.",
    );
    if (state.previewTimer) {
      window.clearTimeout(state.previewTimer);
    }
    state.previewTimer = window.setTimeout(fetchPreview, 120);
    updateGuide();
  }

  async function fetchPreview() {
    try {
      shell.setStatus("Updating PINN preview...");
      const payload = await fetchPinnPreview(getConfig());
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
      shell.setStatus("PINN preview ready");
    } catch (error) {
      shell.setStatus("PINN preview error");
      shell.setGuide(`Unable to update the PINN preview.<br><br>${String(error)}`);
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
      renderLossPlot(ui.bottomPlot, state.losses);
      if (state.losses.epoch.length === 0) {
        renderNotePlot(ui.bottomPlot, "Training Curves", [
          "A completed or in-progress training run will populate this plot.",
        ]);
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
    resetLosses();
    state.latestMetrics = null;
    renderPinnViews();
    setTrainingState(true);
    shell.setStatus("Connecting to PINN training...");
    updateGuide();

    const socket = createPinnSocket();
    state.socket = socket;

    socket.addEventListener("open", () => {
      shell.setStatus("Training PINN...");
      socket.send(JSON.stringify({ type: "start", payload: getConfig() }));
    });

    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);

      if (message.type === "session") {
        shell.setStatus(`Training on ${message.device}`);
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
        shell.setStatus(message.status === "stopped" ? "PINN training stopped" : "PINN training completed");
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
        shell.setStatus("PINN server error");
        shell.setGuide(message.message);
        socket.close();
      }
    });

    socket.addEventListener("close", () => {
      if (state.socket === socket) {
        state.socket = null;
      }
      if (state.isTraining) {
        setTrainingState(false);
        shell.setStatus("PINN training disconnected");
      }
    });

    socket.addEventListener("error", () => {
      setTrainingState(false);
      shell.setStatus("PINN connection failed");
    });
  }

  function stopTraining() {
    if (!state.socket) {
      return;
    }
    shell.setStatus("Stopping PINN training...");
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
      shell.setStatus(statusText);
    }
  }

  function updateGuide() {
    if (!state.controls) {
      return;
    }

    const config = getConfig();
    const notes = [];

    if (!config.normalize_inputs) {
      notes.push("<strong>Normalization is OFF.</strong> This usually makes optimization less stable because the network sees raw coordinates rather than a balanced [-1, 1] input range.");
    }
    if (config.n_domain < 400) {
      notes.push("<strong>Very low domain density.</strong> The PDE residual is being enforced on only a few interior points, so the learned stress field may look patchy or misleading.");
    }
    if (config.n_boundary < 80) {
      notes.push("<strong>Sparse boundary sampling.</strong> The model may satisfy the PDE in the interior but still violate supports or loading conditions around the frame.");
    }
    if (config.sampling_strategy === "adaptive") {
      notes.push("<strong>Adaptive sampling.</strong> More points are placed near inner corners and brace joints where stress concentrations are likely to appear.");
    }
    if (config.geometry === "diagonal") {
      notes.push("<strong>Single diagonal brace.</strong> Compare the stress map against the base frame to see how one load path changes the hotspot pattern.");
    }
    if (config.geometry === "x_brace") {
      notes.push("<strong>X-brace selected.</strong> This usually creates the stiffest reinforcement among the three options and often lowers peak stress near the hole.");
    }
    if (config.pde_weight < 0.8) {
      notes.push("<strong>Low PDE weight.</strong> The model may prioritize boundary fitting while doing a poorer job satisfying equilibrium inside the structure.");
    }
    if (config.bc_weight < 1.0) {
      notes.push("<strong>Low BC weight.</strong> Watch whether the model drifts away from the clamped left edge or the imposed right-edge displacement.");
    }

    if (state.latestMetrics) {
      const { total_loss: totalLoss, pde_loss: pdeLoss, bc_loss: bcLoss } = state.latestMetrics;
      if (totalLoss > 5) {
        notes.push("<strong>Loss is still high.</strong> Try more points, a simpler geometry, or turn normalization on to make optimization easier.");
      }
      if (bcLoss > pdeLoss * 2) {
        notes.push("<strong>Boundary conditions dominate.</strong> The network is struggling more with supports and loading than with the interior PDE residual.");
      }
      if (pdeLoss > bcLoss * 2) {
        notes.push("<strong>Physics residual dominates.</strong> Increase domain points or use adaptive sampling to help the network enforce equilibrium across the frame.");
      }
    }

    if (state.currentCheckpointId === "pinn-preview") {
      notes.push("<strong>Preview-first checkpoint.</strong> Use this stage to understand the point cloud before you train.");
    }

    if (!notes.length) {
      notes.push("<strong>Balanced baseline.</strong> Start training and compare how the three reinforcement options change the stress field and loss curves.");
    }

    shell.setGuide(notes.join("<br><br>"));
  }

  function renderCompareCheckpoint(checkpoint) {
    const femCaseId = runtimeState.fem.latestPreview?.case_id;
    const latestEpoch = runtimeState.pinn.latestMetrics?.epoch;

    renderNotePlot(ui.leftPlot, "Future FEM Baseline", [
      femCaseId ? `Latest numerical case: ${femCaseId}` : "No numerical case has been previewed in this session.",
      "This panel will later host FEM fields or exported comparison data.",
    ]);
    renderNotePlot(ui.rightPlot, "Future PINN Snapshot", [
      latestEpoch ? `Latest PINN epoch seen: ${latestEpoch}` : "No PINN training metrics have been captured in this session.",
      "This panel will later host the PINN side of the comparison.",
    ]);
    renderNotePlot(ui.bottomPlot, "Comparison Roadmap", [
      "The checkpoint shell is ready for a future FEM-vs-PINN comparison step.",
      "Once FEM solve exists, this checkpoint can switch from manual to rule-based completion.",
    ]);

    shell.setPlotMeta({
      leftTitle: "FEM Reference",
      leftSummary: femCaseId ? femCaseId : "Waiting for numerical data",
      rightTitle: "PINN Reference",
      rightSummary: latestEpoch ? `Epoch ${latestEpoch}` : "Waiting for PINN data",
      bottomTitle: "Comparison Checkpoint",
      bottomSummary: "Planned future integration",
    });
    shell.setControlsSummary(checkpoint.controlsSubtitle);
    shell.setStatus("PINN comparison checkpoint active");
    shell.setGuide(
      `<strong>${checkpoint.title}</strong><br><br>${checkpoint.subtitle}<br><br>` +
        "This stage is intentionally scaffolded so the shell can grow into automatic FEM-vs-PINN requirement checks later.",
    );
  }

  return {
    enter,
    leave,
  };
}
