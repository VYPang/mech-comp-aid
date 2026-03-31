const ui = {
  form: document.getElementById("controls-form"),
  geometry: document.getElementById("geometry"),
  samplingStrategy: document.getElementById("sampling_strategy"),
  nDomain: document.getElementById("n_domain"),
  nBoundary: document.getElementById("n_boundary"),
  epochs: document.getElementById("epochs"),
  pdeWeight: document.getElementById("pde_weight"),
  bcWeight: document.getElementById("bc_weight"),
  hiddenDim: document.getElementById("hidden_dim"),
  nHiddenLayers: document.getElementById("n_hidden_layers"),
  normalizeInputs: document.getElementById("normalize_inputs"),
  startButton: document.getElementById("start-button"),
  stopButton: document.getElementById("stop-button"),
  statusText: document.getElementById("status-text"),
  pointCountSummary: document.getElementById("point-count-summary"),
  stressSummary: document.getElementById("stress-summary"),
  lossSummary: document.getElementById("loss-summary"),
  guideBox: document.getElementById("guide-box"),
  valueLabels: {
    n_domain: document.getElementById("n_domain_value"),
    n_boundary: document.getElementById("n_boundary_value"),
    epochs: document.getElementById("epochs_value"),
    pde_weight: document.getElementById("pde_weight_value"),
    bc_weight: document.getElementById("bc_weight_value"),
    hidden_dim: document.getElementById("hidden_dim_value"),
    n_hidden_layers: document.getElementById("n_hidden_layers_value"),
  },
};

const state = {
  socket: null,
  isTraining: false,
  previewTimer: null,
  losses: {
    epoch: [],
    total: [],
    pde: [],
    bc: [],
  },
  latestMetrics: null,
  latestPreview: null,
};

const plotLayoutBase = {
  paper_bgcolor: "rgba(15, 23, 42, 0)",
  plot_bgcolor: "rgba(15, 23, 42, 0)",
  font: { color: "#cbd5e1" },
  margin: { l: 52, r: 24, t: 22, b: 44 },
};

function getConfig() {
  return {
    geometry: ui.geometry.value,
    sampling_strategy: ui.samplingStrategy.value,
    n_domain: Number(ui.nDomain.value),
    n_boundary: Number(ui.nBoundary.value),
    epochs: Number(ui.epochs.value),
    normalize_inputs: ui.normalizeInputs.checked,
    pde_weight: Number(ui.pdeWeight.value),
    bc_weight: Number(ui.bcWeight.value),
    hidden_dim: Number(ui.hiddenDim.value),
    n_hidden_layers: Number(ui.nHiddenLayers.value),
    learning_rate: 0.001,
    update_every: 50,
    stress_grid_n: 40,
    seed: 0,
    load_displacement: 0.02,
  };
}

function updateValueLabels() {
  ui.valueLabels.n_domain.textContent = ui.nDomain.value;
  ui.valueLabels.n_boundary.textContent = ui.nBoundary.value;
  ui.valueLabels.epochs.textContent = ui.epochs.value;
  ui.valueLabels.pde_weight.textContent = Number(ui.pdeWeight.value).toFixed(1);
  ui.valueLabels.bc_weight.textContent = Number(ui.bcWeight.value).toFixed(1);
  ui.valueLabels.hidden_dim.textContent = ui.hiddenDim.value;
  ui.valueLabels.n_hidden_layers.textContent = ui.nHiddenLayers.value;
}

function setStatus(text) {
  ui.statusText.textContent = text;
}

function setTrainingState(isTraining) {
  state.isTraining = isTraining;
  ui.startButton.disabled = isTraining;
  ui.stopButton.disabled = !isTraining;
  ui.startButton.classList.toggle("opacity-60", isTraining);
  ui.startButton.classList.toggle("cursor-not-allowed", isTraining);
  ui.stopButton.classList.toggle("opacity-60", !isTraining);
}

function makeWsUrl() {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws/train`;
}

function resetLosses() {
  state.losses = { epoch: [], total: [], pde: [], bc: [] };
  Plotly.react(
    "loss-plot",
    [
      { x: [], y: [], mode: "lines+markers", name: "Total Loss", line: { color: "#22d3ee" } },
      { x: [], y: [], mode: "lines+markers", name: "Physics Loss", line: { color: "#818cf8" } },
      { x: [], y: [], mode: "lines+markers", name: "BC Loss", line: { color: "#f97316" } },
    ],
    {
      ...plotLayoutBase,
      xaxis: { title: "Epoch", gridcolor: "rgba(148, 163, 184, 0.15)" },
      yaxis: { title: "Loss", gridcolor: "rgba(148, 163, 184, 0.15)" },
      legend: { orientation: "h", y: 1.15 },
    },
    { responsive: true }
  );
}

function initPlots() {
  Plotly.newPlot(
    "point-cloud-plot",
    [
      {
        x: [],
        y: [],
        type: "scattergl",
        mode: "markers",
        name: "Domain",
        marker: { size: 5, color: "#22d3ee", opacity: 0.75 },
      },
      {
        x: [],
        y: [],
        type: "scattergl",
        mode: "markers",
        name: "Boundary",
        marker: { size: 6, color: "#f59e0b", opacity: 0.95 },
      },
    ],
    {
      ...plotLayoutBase,
      xaxis: { title: "x", range: [0, 1], gridcolor: "rgba(148, 163, 184, 0.15)" },
      yaxis: {
        title: "y",
        range: [0, 1],
        scaleanchor: "x",
        scaleratio: 1,
        gridcolor: "rgba(148, 163, 184, 0.15)",
      },
      legend: { orientation: "h", y: 1.15 },
    },
    { responsive: true }
  );

  Plotly.newPlot(
    "stress-plot",
    [
      {
        z: [[null]],
        x: [0],
        y: [0],
        type: "heatmap",
        colorscale: "Turbo",
        colorbar: { title: "Stress" },
      },
    ],
    {
      ...plotLayoutBase,
      xaxis: { title: "x" },
      yaxis: { title: "y", scaleanchor: "x", scaleratio: 1 },
    },
    { responsive: true }
  );

  resetLosses();
}

function renderPreview(payload) {
  state.latestPreview = payload;
  Plotly.react(
    "point-cloud-plot",
    [
      {
        x: payload.domain_points.x,
        y: payload.domain_points.y,
        type: "scattergl",
        mode: "markers",
        name: "Domain",
        marker: { size: 5, color: "#22d3ee", opacity: 0.75 },
      },
      {
        x: payload.boundary_points.x,
        y: payload.boundary_points.y,
        type: "scattergl",
        mode: "markers",
        name: "Boundary",
        marker: { size: 6, color: "#f59e0b", opacity: 0.95 },
      },
    ],
    {
      ...plotLayoutBase,
      xaxis: { title: "x", range: [0, 1], gridcolor: "rgba(148, 163, 184, 0.15)" },
      yaxis: {
        title: "y",
        range: [0, 1],
        scaleanchor: "x",
        scaleratio: 1,
        gridcolor: "rgba(148, 163, 184, 0.15)",
      },
      legend: { orientation: "h", y: 1.15 },
    },
    { responsive: true }
  );
  ui.pointCountSummary.textContent = `${payload.counts.n_domain} domain, ${payload.counts.n_boundary} boundary`;
}

function renderStress(grid, epoch) {
  Plotly.react(
    "stress-plot",
    [
      {
        z: grid.z,
        x: grid.x,
        y: grid.y,
        type: "heatmap",
        colorscale: "Turbo",
        colorbar: { title: "Stress" },
      },
    ],
    {
      ...plotLayoutBase,
      xaxis: { title: "x", gridcolor: "rgba(148, 163, 184, 0.15)" },
      yaxis: {
        title: "y",
        scaleanchor: "x",
        scaleratio: 1,
        gridcolor: "rgba(148, 163, 184, 0.15)",
      },
    },
    { responsive: true }
  );
  ui.stressSummary.textContent = `Updated at epoch ${epoch}`;
}

function appendLoss(metrics) {
  state.losses = {
    epoch: [...state.losses.epoch, metrics.epoch],
    total: [...state.losses.total, metrics.total_loss],
    pde: [...state.losses.pde, metrics.pde_loss],
    bc: [...state.losses.bc, metrics.bc_loss],
  };
  state.latestMetrics = metrics;

  Plotly.react(
    "loss-plot",
    [
      {
        x: state.losses.epoch,
        y: state.losses.total,
        mode: "lines+markers",
        name: "Total Loss",
        line: { color: "#22d3ee" },
      },
      {
        x: state.losses.epoch,
        y: state.losses.pde,
        mode: "lines+markers",
        name: "Physics Loss",
        line: { color: "#818cf8" },
      },
      {
        x: state.losses.epoch,
        y: state.losses.bc,
        mode: "lines+markers",
        name: "BC Loss",
        line: { color: "#f97316" },
      },
    ],
    {
      ...plotLayoutBase,
      xaxis: { title: "Epoch", gridcolor: "rgba(148, 163, 184, 0.15)" },
      yaxis: { title: "Loss", gridcolor: "rgba(148, 163, 184, 0.15)" },
      legend: { orientation: "h", y: 1.15 },
    },
    { responsive: true }
  );
  ui.lossSummary.textContent = `Epoch ${metrics.epoch}: total ${metrics.total_loss.toFixed(4)}`;
}

function updateGuide() {
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
    const { total_loss, pde_loss, bc_loss } = state.latestMetrics;
    if (total_loss > 5) {
      notes.push("<strong>Loss is still high.</strong> Try more points, a simpler geometry, or turn normalization on to make optimization easier.");
    }
    if (bc_loss > pde_loss * 2) {
      notes.push("<strong>Boundary conditions dominate.</strong> The network is struggling more with supports and loading than with the interior PDE residual.");
    }
    if (pde_loss > bc_loss * 2) {
      notes.push("<strong>Physics residual dominates.</strong> Increase domain points or use adaptive sampling to help the network enforce equilibrium across the frame.");
    }
  }

  if (!notes.length) {
    notes.push("<strong>Balanced baseline.</strong> Start training and compare how the three reinforcement options change the stress field and loss curves.");
  }

  ui.guideBox.innerHTML = notes.join("<br><br>");
}

async function fetchPreview() {
  try {
    const response = await fetch("/api/preview-points", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(getConfig()),
    });
    if (!response.ok) {
      throw new Error(`Preview request failed (${response.status})`);
    }
    const payload = await response.json();
    renderPreview(payload);
    updateGuide();
  } catch (error) {
    setStatus("Preview error");
    ui.guideBox.textContent = String(error);
  }
}

function schedulePreview() {
  if (state.isTraining) {
    updateGuide();
    return;
  }
  clearTimeout(state.previewTimer);
  state.previewTimer = window.setTimeout(fetchPreview, 120);
  updateGuide();
}

function closeSocket() {
  if (state.socket) {
    try {
      state.socket.close();
    } catch (_error) {
      // no-op
    }
    state.socket = null;
  }
}

function startTraining() {
  closeSocket();
  resetLosses();
  state.latestMetrics = null;
  setTrainingState(true);
  setStatus("Connecting...");
  updateGuide();

  const socket = new WebSocket(makeWsUrl());
  state.socket = socket;

  socket.addEventListener("open", () => {
    setStatus("Training...");
    socket.send(JSON.stringify({ type: "start", payload: getConfig() }));
  });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);

    if (message.type === "session") {
      setStatus(`Training on ${message.device}`);
      return;
    }
    if (message.type === "preview") {
      renderPreview(message);
      updateGuide();
      return;
    }
    if (message.type === "metrics") {
      appendLoss(message);
      renderStress(message.stress_grid, message.epoch);
      updateGuide();
      return;
    }
    if (message.type === "complete") {
      setTrainingState(false);
      setStatus(message.status === "stopped" ? "Stopped" : "Completed");
      updateGuide();
      socket.close();
      return;
    }
    if (message.type === "error") {
      setTrainingState(false);
      setStatus("Server error");
      ui.guideBox.textContent = message.message;
      socket.close();
    }
  });

  socket.addEventListener("close", () => {
    if (state.socket === socket) {
      state.socket = null;
    }
    if (state.isTraining) {
      setTrainingState(false);
      setStatus("Disconnected");
    }
  });

  socket.addEventListener("error", () => {
    setTrainingState(false);
    setStatus("Connection failed");
  });
}

function stopTraining() {
  if (!state.socket) {
    return;
  }
  setStatus("Stopping...");
  try {
    state.socket.send(JSON.stringify({ type: "stop" }));
  } catch (_error) {
    closeSocket();
    setTrainingState(false);
    setStatus("Stopped");
  }
}

function bindEvents() {
  const controls = [
    ui.geometry,
    ui.samplingStrategy,
    ui.nDomain,
    ui.nBoundary,
    ui.epochs,
    ui.pdeWeight,
    ui.bcWeight,
    ui.hiddenDim,
    ui.nHiddenLayers,
    ui.normalizeInputs,
  ];

  controls.forEach((control) => {
    control.addEventListener("input", () => {
      updateValueLabels();
      schedulePreview();
    });
    control.addEventListener("change", () => {
      updateValueLabels();
      schedulePreview();
    });
  });

  ui.startButton.addEventListener("click", startTraining);
  ui.stopButton.addEventListener("click", stopTraining);
}

function bootstrap() {
  updateValueLabels();
  initPlots();
  bindEvents();
  schedulePreview();
  setStatus("Idle");
}

bootstrap();
