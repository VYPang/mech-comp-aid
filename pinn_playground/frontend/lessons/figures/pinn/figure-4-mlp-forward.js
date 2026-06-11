// Figure 4 - MLP forward pass schematic.
// Adjustable width and depth; an input value flows through, activations
// light up layer by layer, predicted output compared to a target.
import {
  buildFigureShell,
  makeFrameScheduler,
  makeRng,
  setupCanvas,
} from "../../figure-base.js?v=checkpoint-shell-15";

function buildNetwork(width, depth, seed) {
  const rng = makeRng(seed);
  const layers = [];
  let prev = 1;
  for (let d = 0; d < depth; d += 1) {
    const W = Array.from({ length: width }, () =>
      Array.from({ length: prev }, () => (rng() - 0.5) * 2.0));
    const b = Array.from({ length: width }, () => (rng() - 0.5) * 0.5);
    layers.push({ W, b });
    prev = width;
  }
  layers.push({
    W: Array.from({ length: 1 }, () => Array.from({ length: prev }, () => (rng() - 0.5) * 2.0)),
    b: [(rng() - 0.5) * 0.5],
  });
  return layers;
}

function tanh(x) { return Math.tanh(x); }

function forward(layers, x) {
  let h = [x];
  const acts = [h];
  for (let i = 0; i < layers.length; i += 1) {
    const { W, b } = layers[i];
    const out = new Array(W.length);
    for (let r = 0; r < W.length; r += 1) {
      let s = b[r];
      for (let c = 0; c < W[r].length; c += 1) s += W[r][c] * h[c];
      out[r] = i === layers.length - 1 ? s : tanh(s);
    }
    h = out;
    acts.push(out);
  }
  return acts;
}

function paramCount(layers) {
  return layers.reduce((s, l) => s + l.W.length * l.W[0].length + l.b.length, 0);
}

function targetFn(x) { return Math.sin(2 * x) + 0.3 * x; }

export function createMlpForwardFigure(container) {
  const { body } = buildFigureShell(container, {
    title: "Figure 4 - Forward pass through an MLP",
    caption: "Activations are colored by sign and magnitude. Loss is the squared gap between prediction and target.",
  });

  const controls = document.createElement("div");
  controls.className = "lesson-figure-controls";
  controls.innerHTML = `
    <label class="lesson-control">
      <span>Hidden width</span>
      <input type="range" min="2" max="8" step="1" value="4" data-role="width" />
      <span class="lesson-control-value" data-role="width-value">4</span>
    </label>
    <label class="lesson-control">
      <span>Hidden layers</span>
      <input type="range" min="1" max="4" step="1" value="2" data-role="depth" />
      <span class="lesson-control-value" data-role="depth-value">2</span>
    </label>
    <label class="lesson-control">
      <span>Input x</span>
      <input type="range" min="-2" max="2" step="0.05" value="0.4" data-role="input" />
      <span class="lesson-control-value" data-role="input-value">0.40</span>
    </label>
    <button type="button" class="lesson-button" data-role="reseed">New random weights</button>
  `;
  body.appendChild(controls);

  const layout = document.createElement("div");
  layout.className = "lesson-figure-grid";
  const canvasWrap = document.createElement("div");
  canvasWrap.className = "lesson-figure-canvas-wrap";
  const canvas = document.createElement("canvas");
  canvasWrap.appendChild(canvas);
  const sidebar = document.createElement("div");
  sidebar.className = "lesson-figure-sidebar";
  layout.append(canvasWrap, sidebar);
  body.appendChild(layout);

  const state = {
    width: 4,
    depth: 2,
    input: 0.4,
    seed: 7,
    layers: buildNetwork(4, 2, 7),
    acts: null,
  };

  let ctx;
  let cssWidth = 0;
  let cssHeight = 0;
  const scheduleDraw = makeFrameScheduler(draw);

  function recompute() {
    state.acts = forward(state.layers, state.input);
  }

  function layoutCanvas() {
    cssWidth = canvasWrap.clientWidth || 520;
    cssHeight = 320;
    ctx = setupCanvas(canvas, cssWidth, cssHeight);
  }

  function activationColor(a) {
    const t = Math.tanh(a);
    if (t >= 0) {
      const v = Math.round(255 * t);
      return `rgb(${34 + v * 0.4 | 0}, ${211}, ${238})`;
    }
    const v = Math.round(255 * -t);
    return `rgb(${244}, ${114 - v * 0.3 | 0}, ${182 - v * 0.3 | 0})`;
  }

  function draw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    const acts = state.acts;
    const cols = acts.length;
    const colW = cssWidth / (cols + 1);
    const positions = acts.map((layer, ci) => layer.map((_, ri) => {
      const x = colW * (ci + 1);
      const y = (cssHeight / (layer.length + 1)) * (ri + 1);
      return [x, y];
    }));

    // edges
    for (let ci = 1; ci < acts.length; ci += 1) {
      const layer = state.layers[ci - 1];
      for (let r = 0; r < layer.W.length; r += 1) {
        for (let c = 0; c < layer.W[r].length; c += 1) {
          const w = layer.W[r][c];
          const thickness = 0.5 + Math.min(6.5, Math.abs(w) ** 1.2 * 4.8);
          ctx.lineWidth = thickness;
          ctx.strokeStyle = w >= 0
            ? "rgba(34, 211, 238, 0.82)"
            : "rgba(244, 114, 182, 0.82)";
          const [x1, y1] = positions[ci - 1][c];
          const [x2, y2] = positions[ci][r];
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
      }
    }

    // nodes
    acts.forEach((layer, ci) => {
      layer.forEach((a, ri) => {
        const [x, y] = positions[ci][ri];
        ctx.beginPath();
        ctx.fillStyle = activationColor(a);
        ctx.strokeStyle = "rgb(15, 23, 42)";
        ctx.lineWidth = 2;
        ctx.arc(x, y, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "rgb(15, 23, 42)";
        ctx.font = "11px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(a.toFixed(2), x, y);
      });
    });

    // labels
    ctx.fillStyle = "rgba(148,163,184,0.9)";
    ctx.font = "11px Inter, sans-serif";
    ctx.textAlign = "center";
    acts.forEach((_, ci) => {
      const x = colW * (ci + 1);
      let label;
      if (ci === 0) label = "input";
      else if (ci === acts.length - 1) label = "output";
      else label = `hidden ${ci}`;
      ctx.fillText(label, x, cssHeight - 8);
    });

    const pred = acts[acts.length - 1][0];
    const target = targetFn(state.input);
    const loss = (pred - target) ** 2;

    sidebar.innerHTML = `
      <div class="lesson-stat-row"><span>Parameters</span><strong>${paramCount(state.layers)}</strong></div>
      <div class="lesson-stat-row"><span>Prediction</span><strong>${pred.toFixed(3)}</strong></div>
      <div class="lesson-stat-row"><span>Target</span><strong>${target.toFixed(3)}</strong></div>
      <div class="lesson-stat-row"><span>Squared error</span><strong>${loss.toFixed(4)}</strong></div>
      <p class="lesson-figure-hint">Weights are random — no training happens here. We only watch how the function shape and parameter count change with architecture.</p>
    `;
  }

  function rebuild() {
    state.layers = buildNetwork(state.width, state.depth, state.seed);
    recompute();
  }

  function init() {
    layoutCanvas();
    recompute();
    const widthInput = controls.querySelector("[data-role=width]");
    const widthValue = controls.querySelector("[data-role=width-value]");
    const depthInput = controls.querySelector("[data-role=depth]");
    const depthValue = controls.querySelector("[data-role=depth-value]");
    const inputInput = controls.querySelector("[data-role=input]");
    const inputValue = controls.querySelector("[data-role=input-value]");
    const reseed = controls.querySelector("[data-role=reseed]");
    widthInput.addEventListener("input", () => {
      state.width = parseInt(widthInput.value, 10);
      widthValue.textContent = String(state.width);
      rebuild();
      scheduleDraw();
    });
    depthInput.addEventListener("input", () => {
      state.depth = parseInt(depthInput.value, 10);
      depthValue.textContent = String(state.depth);
      rebuild();
      scheduleDraw();
    });
    inputInput.addEventListener("input", () => {
      state.input = parseFloat(inputInput.value);
      inputValue.textContent = state.input.toFixed(2);
      recompute();
      scheduleDraw();
    });
    reseed.addEventListener("click", () => {
      state.seed = (state.seed * 16807 + 1) >>> 0;
      rebuild();
      scheduleDraw();
    });
    const resizeObs = new ResizeObserver(() => { layoutCanvas(); scheduleDraw(); });
    resizeObs.observe(canvasWrap);
    scheduleDraw();
  }

  init();
  return { update() { scheduleDraw(); }, destroy() { container.innerHTML = ""; } };
}
