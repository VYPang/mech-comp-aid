// Figure 2 - Noisy polynomial curve fitting.
// Fixed five points sampled from a hidden cubic + Gaussian noise.
// User picks polynomial degree; we re-fit by least squares on every change.
import {
  buildFigureShell,
  drawAxes,
  gauss,
  makeFrameScheduler,
  makeMapper,
  makeRng,
  polyEval,
  polyFit,
  setupCanvas,
} from "../figure-base.js?v=checkpoint-shell-14";

const TRUE_COEFFS = [0.4, -0.6, -0.2, 0.18]; // y = 0.4 - 0.6 x - 0.2 x^2 + 0.18 x^3

function regenerate(seed) {
  const rng = makeRng(seed);
  const xs = [];
  const ys = [];
  for (let i = 0; i < 5; i += 1) {
    const x = -2.6 + (5.2 * (i + 0.4 + rng() * 0.2)) / 5;
    const yClean = polyEval(TRUE_COEFFS, x);
    const yNoisy = yClean + gauss(rng) * 0.55;
    xs.push(x);
    ys.push(yNoisy);
  }
  return { xs, ys };
}

export function createPolynomialFitFigure(container) {
  const { body, captionEl } = buildFigureShell(container, {
    title: "Figure 2 - Five noisy points, choose your polynomial degree",
    caption: "A higher degree always lowers training loss. It does not always lower test loss.",
  });

  const controls = document.createElement("div");
  controls.className = "lesson-figure-controls";
  controls.innerHTML = `
    <label class="lesson-control">
      <span>Polynomial degree</span>
      <input type="range" min="1" max="8" step="1" value="3" data-role="degree" />
      <span class="lesson-control-value" data-role="degree-value">3</span>
    </label>
    <label class="lesson-control lesson-control-checkbox">
      <input type="checkbox" data-role="show-truth" /> Show hidden true cubic
    </label>
    <button type="button" class="lesson-button" data-role="regenerate">Regenerate noisy data</button>
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
    seed: 42,
    degree: 3,
    showTruth: false,
    data: regenerate(42),
    coeffs: null,
    trainLoss: 0,
  };

  let ctx;
  let mapper;
  const scheduleDraw = makeFrameScheduler(draw);

  function fit() {
    state.coeffs = polyFit(state.data.xs, state.data.ys, state.degree);
    let s = 0;
    for (let i = 0; i < state.data.xs.length; i += 1) {
      const e = polyEval(state.coeffs, state.data.xs[i]) - state.data.ys[i];
      s += e * e;
    }
    state.trainLoss = s / state.data.xs.length;
  }

  function layoutCanvas() {
    const cssWidth = canvasWrap.clientWidth || 480;
    const cssHeight = Math.round(cssWidth * 0.62);
    ctx = setupCanvas(canvas, cssWidth, cssHeight);
    mapper = makeMapper({
      xDomain: [-3, 3],
      yDomain: [-3, 3],
      width: cssWidth,
      height: cssHeight,
      padding: 32,
    });
  }

  function drawCurve(coeffs, color, dashed = false) {
    if (!coeffs) return;
    ctx.beginPath();
    ctx.lineWidth = dashed ? 1.5 : 2;
    ctx.setLineDash(dashed ? [6, 5] : []);
    ctx.strokeStyle = color;
    const { x0, x1 } = mapper.bounds;
    const steps = 240;
    for (let i = 0; i <= steps; i += 1) {
      const x = x0 + (x1 - x0) * (i / steps);
      const y = polyEval(coeffs, x);
      const [px, py] = mapper.toPx(x, y);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function draw() {
    if (!ctx) return;
    const { width, height } = mapper.bounds;
    ctx.clearRect(0, 0, width, height);
    drawAxes(ctx, mapper);

    if (state.showTruth) drawCurve(TRUE_COEFFS, "rgba(148, 163, 184, 0.85)", true);
    drawCurve(state.coeffs, "rgb(34, 211, 238)");

    state.data.xs.forEach((x, i) => {
      const [px, py] = mapper.toPx(x, state.data.ys[i]);
      ctx.beginPath();
      ctx.fillStyle = "rgb(250, 204, 21)";
      ctx.strokeStyle = "rgb(15, 23, 42)";
      ctx.lineWidth = 2;
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });

    let label = "reasonable fit";
    let toneClass = "lesson-callout-good";
    if (state.degree <= 1) { label = "underfit"; toneClass = "lesson-callout-warn"; }
    else if (state.degree >= 6) { label = "likely overfit"; toneClass = "lesson-callout-warn"; }

    sidebar.innerHTML = `
      <div class="lesson-stat-row"><span>Degree</span><strong>${state.degree}</strong></div>
      <div class="lesson-stat-row"><span>Training MSE</span><strong>${state.trainLoss.toFixed(4)}</strong></div>
      <div class="lesson-callout ${toneClass}">Qualitative: ${label}</div>
      <p class="lesson-figure-hint">Same five points. The flexibility of the model class is the only thing changing.</p>
    `;
  }

  function init() {
    layoutCanvas();
    fit();
    const degreeInput = controls.querySelector("[data-role=degree]");
    const degreeValue = controls.querySelector("[data-role=degree-value]");
    const showTruth = controls.querySelector("[data-role=show-truth]");
    const regen = controls.querySelector("[data-role=regenerate]");
    degreeInput.addEventListener("input", () => {
      state.degree = parseInt(degreeInput.value, 10);
      degreeValue.textContent = String(state.degree);
      fit();
      scheduleDraw();
    });
    showTruth.addEventListener("change", () => {
      state.showTruth = showTruth.checked;
      scheduleDraw();
    });
    regen.addEventListener("click", () => {
      state.seed = (state.seed * 9301 + 49297) >>> 0;
      state.data = regenerate(state.seed);
      fit();
      scheduleDraw();
    });
    const resizeObs = new ResizeObserver(() => { layoutCanvas(); scheduleDraw(); });
    resizeObs.observe(canvasWrap);
    scheduleDraw();
  }

  init();
  return {
    update() { scheduleDraw(); },
    destroy() { container.innerHTML = ""; },
  };
}
