// Figure 3 - Generalization and prediction.
// Train on a small set, evaluate hidden test set, scrub a query cursor.
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

const TRUE_COEFFS = [0.2, 1.1, -0.45, 0.05]; // monotone-ish cubic

function generate(seed, n, sigma) {
  const rng = makeRng(seed);
  const xs = [];
  const ys = [];
  for (let i = 0; i < n; i += 1) {
    const t = rng();
    const x = -2.5 + 5 * t;
    const y = polyEval(TRUE_COEFFS, x) + gauss(rng) * sigma;
    xs.push(x);
    ys.push(y);
  }
  return { xs, ys };
}

export function createGeneralizationFigure(container) {
  const { body } = buildFigureShell(container, {
    title: "Figure 3 - Capacity vs generalization",
    caption: "Drag the cursor to query a new x. Compare the prediction to the hidden test points.",
  });

  const controls = document.createElement("div");
  controls.className = "lesson-figure-controls";
  controls.innerHTML = `
    <label class="lesson-control">
      <span>Capacity (degree)</span>
      <input type="range" min="1" max="10" step="1" value="3" data-role="degree" />
      <span class="lesson-control-value" data-role="degree-value">3</span>
    </label>
    <label class="lesson-control lesson-control-checkbox">
      <input type="checkbox" data-role="show-test" checked /> Show test points
    </label>
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
    train: generate(11, 8, 0.45),
    test: generate(99, 30, 0.45),
    degree: 3,
    showTest: true,
    queryX: 0.5,
    coeffs: null,
    trainMse: 0,
    testMse: 0,
  };

  let ctx;
  let mapper;
  const scheduleDraw = makeFrameScheduler(draw);

  function fit() {
    state.coeffs = polyFit(state.train.xs, state.train.ys, state.degree);
    state.trainMse = mse(state.train);
    state.testMse = mse(state.test);
  }

  function mse({ xs, ys }) {
    let s = 0;
    for (let i = 0; i < xs.length; i += 1) {
      const e = polyEval(state.coeffs, xs[i]) - ys[i];
      s += e * e;
    }
    return s / xs.length;
  }

  function layoutCanvas() {
    const cssWidth = canvasWrap.clientWidth || 480;
    const cssHeight = Math.round(cssWidth * 0.62);
    ctx = setupCanvas(canvas, cssWidth, cssHeight);
    mapper = makeMapper({
      xDomain: [-3, 3],
      yDomain: [-4, 4],
      width: cssWidth,
      height: cssHeight,
      padding: 32,
    });
  }

  function draw() {
    if (!ctx) return;
    const { width, height, x0, x1 } = mapper.bounds;
    ctx.clearRect(0, 0, width, height);
    drawAxes(ctx, mapper);

    // Fitted curve
    ctx.beginPath();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgb(34, 211, 238)";
    const steps = 240;
    for (let i = 0; i <= steps; i += 1) {
      const x = x0 + (x1 - x0) * (i / steps);
      const y = polyEval(state.coeffs, x);
      const [px, py] = mapper.toPx(x, y);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Test points
    if (state.showTest) {
      state.test.xs.forEach((x, i) => {
        const [px, py] = mapper.toPx(x, state.test.ys[i]);
        ctx.beginPath();
        ctx.fillStyle = "rgba(148, 163, 184, 0.6)";
        ctx.arc(px, py, 3.5, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // Train points
    state.train.xs.forEach((x, i) => {
      const [px, py] = mapper.toPx(x, state.train.ys[i]);
      ctx.beginPath();
      ctx.fillStyle = "rgb(250, 204, 21)";
      ctx.strokeStyle = "rgb(15, 23, 42)";
      ctx.lineWidth = 1.5;
      ctx.arc(px, py, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });

    // Query cursor
    const qy = polyEval(state.coeffs, state.queryX);
    const trueQy = polyEval(TRUE_COEFFS, state.queryX);
    const [qPx] = mapper.toPx(state.queryX, 0);
    ctx.save();
    ctx.strokeStyle = "rgba(244, 114, 182, 0.8)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(qPx, mapper.bounds.padding);
    ctx.lineTo(qPx, height - mapper.bounds.padding);
    ctx.stroke();
    ctx.restore();
    const [, qPy] = mapper.toPx(state.queryX, qy);
    ctx.beginPath();
    ctx.fillStyle = "rgb(244, 114, 182)";
    ctx.arc(qPx, qPy, 6, 0, Math.PI * 2);
    ctx.fill();

    sidebar.innerHTML = `
      <div class="lesson-stat-row"><span>Train MSE</span><strong>${state.trainMse.toFixed(3)}</strong></div>
      <div class="lesson-stat-row"><span>Test MSE</span><strong>${state.testMse.toFixed(3)}</strong></div>
      <div class="lesson-stat-row"><span>Query x</span><strong>${state.queryX.toFixed(2)}</strong></div>
      <div class="lesson-stat-row"><span>Model y</span><strong>${qy.toFixed(3)}</strong></div>
      <div class="lesson-stat-row"><span>True y</span><strong>${trueQy.toFixed(3)}</strong></div>
      <p class="lesson-figure-hint">Train loss falls smoothly with capacity. Test loss can rise sharply once the model starts chasing noise.</p>
    `;
  }

  function init() {
    layoutCanvas();
    fit();
    const degreeInput = controls.querySelector("[data-role=degree]");
    const degreeValue = controls.querySelector("[data-role=degree-value]");
    const showTest = controls.querySelector("[data-role=show-test]");
    degreeInput.addEventListener("input", () => {
      state.degree = parseInt(degreeInput.value, 10);
      degreeValue.textContent = String(state.degree);
      fit();
      scheduleDraw();
    });
    showTest.addEventListener("change", () => {
      state.showTest = showTest.checked;
      scheduleDraw();
    });
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", (e) => canvas.setPointerCapture(e.pointerId));
    canvas.addEventListener("pointermove", (e) => {
      if (e.buttons === 0) return;
      const rect = canvas.getBoundingClientRect();
      const [mx] = mapper.toMath(e.clientX - rect.left, e.clientY - rect.top);
      state.queryX = Math.max(mapper.bounds.x0 + 0.05, Math.min(mapper.bounds.x1 - 0.05, mx));
      scheduleDraw();
    });
    const resizeObs = new ResizeObserver(() => { layoutCanvas(); scheduleDraw(); });
    resizeObs.observe(canvasWrap);
    scheduleDraw();
  }

  init();
  return { update() { scheduleDraw(); }, destroy() { container.innerHTML = ""; } };
}
