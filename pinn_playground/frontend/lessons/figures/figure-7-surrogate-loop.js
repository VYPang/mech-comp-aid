// Figure 7 - PINN as a surrogate inside a design loop.
// A toy "quantity of interest" (max stress) varies with a design variable.
// Sweep the slider to compare a fast surrogate to occasional FEM checks.
import {
  buildFigureShell,
  drawAxes,
  makeFrameScheduler,
  makeMapper,
  setupCanvas,
} from "../figure-base.js?v=checkpoint-shell-15";

function femGroundTruth(d) {
  // Toy: peak stress vs brace position.
  return 1.4 + 0.6 * Math.cos((d - 0.32) * 7.5) - 0.18 * d + 0.3 * Math.exp(-((d - 0.7) ** 2) / 0.01);
}

function surrogate(d) {
  // Smooth approximation: misses the sharp local feature near d=0.7
  return 1.4 + 0.6 * Math.cos((d - 0.32) * 7.5) - 0.18 * d;
}

export function createSurrogateFigure(container) {
  const { body } = buildFigureShell(container, {
    title: "Figure 7 - Surrogate prediction inside a design loop",
    caption: "Surrogates are fast and differentiable. FEM checkpoints catch features the surrogate has not learned.",
  });

  const controls = document.createElement("div");
  controls.className = "lesson-figure-controls";
  controls.innerHTML = `
    <label class="lesson-control">
      <span>Design variable d</span>
      <input type="range" min="0.05" max="0.95" step="0.005" value="0.5" data-role="d" />
      <span class="lesson-control-value" data-role="d-value">0.500</span>
    </label>
    <label class="lesson-control lesson-control-checkbox"><input type="checkbox" data-role="show-fem" /> Show FEM ground truth</label>
    <button type="button" class="lesson-button" data-role="verify">Run FEM verification at current d</button>
    <button type="button" class="lesson-button lesson-button-secondary" data-role="clear">Clear FEM checks</button>
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
    d: 0.5,
    showFem: false,
    checks: [],
  };

  let ctx; let mapper;
  const scheduleDraw = makeFrameScheduler(draw);

  function layoutCanvas() {
    const cssWidth = canvasWrap.clientWidth || 520;
    const cssHeight = Math.round(cssWidth * 0.5);
    ctx = setupCanvas(canvas, cssWidth, cssHeight);
    mapper = makeMapper({
      xDomain: [0, 1],
      yDomain: [0, 2.6],
      width: cssWidth,
      height: cssHeight,
      padding: 36,
    });
  }

  function drawCurve(fn, color, dashed) {
    ctx.beginPath();
    ctx.lineWidth = 2;
    ctx.setLineDash(dashed ? [6, 5] : []);
    ctx.strokeStyle = color;
    const steps = 240;
    for (let i = 0; i <= steps; i += 1) {
      const x = i / steps;
      const y = fn(x);
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
    drawAxes(ctx, mapper, { stepX: 0.1, stepY: 0.5 });

    drawCurve(surrogate, "rgb(34, 211, 238)", false);
    if (state.showFem) drawCurve(femGroundTruth, "rgba(244, 114, 182, 0.8)", true);

    state.checks.forEach((c) => {
      const [px, py] = mapper.toPx(c.d, c.value);
      ctx.beginPath();
      ctx.fillStyle = "rgb(244, 114, 182)";
      ctx.strokeStyle = "rgb(15, 23, 42)";
      ctx.lineWidth = 2;
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });

    const sVal = surrogate(state.d);
    const fVal = femGroundTruth(state.d);
    const [px] = mapper.toPx(state.d, 0);
    ctx.save();
    ctx.strokeStyle = "rgba(250, 204, 21, 0.8)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(px, mapper.bounds.padding);
    ctx.lineTo(px, height - mapper.bounds.padding);
    ctx.stroke();
    ctx.restore();
    const [, sy] = mapper.toPx(state.d, sVal);
    ctx.beginPath();
    ctx.fillStyle = "rgb(250, 204, 21)";
    ctx.arc(px, sy, 7, 0, Math.PI * 2);
    ctx.fill();

    const trusted = Math.abs(sVal - fVal) < 0.18;
    sidebar.innerHTML = `
      <div class="lesson-stat-row"><span>Surrogate σ̂</span><strong>${sVal.toFixed(3)}</strong></div>
      <div class="lesson-stat-row"><span>FEM σ (hidden)</span><strong>${state.showFem ? fVal.toFixed(3) : "— hidden —"}</strong></div>
      <div class="lesson-stat-row"><span>FEM checks placed</span><strong>${state.checks.length}</strong></div>
      <div class="lesson-callout ${trusted ? "lesson-callout-good" : "lesson-callout-warn"}">
        ${trusted ? "Inside surrogate's trusted regime." : "Outside trusted regime — schedule a FEM verification."}
      </div>
      <p class="lesson-figure-hint">Drag d quickly: the surrogate is essentially free. FEM checks (pink dots) become reference anchors.</p>
    `;
  }

  function init() {
    layoutCanvas();
    const dInput = controls.querySelector("[data-role=d]");
    const dValue = controls.querySelector("[data-role=d-value]");
    const showFem = controls.querySelector("[data-role=show-fem]");
    const verify = controls.querySelector("[data-role=verify]");
    const clear = controls.querySelector("[data-role=clear]");
    dInput.addEventListener("input", () => {
      state.d = parseFloat(dInput.value);
      dValue.textContent = state.d.toFixed(3);
      scheduleDraw();
    });
    showFem.addEventListener("change", () => { state.showFem = showFem.checked; scheduleDraw(); });
    verify.addEventListener("click", () => {
      state.checks.push({ d: state.d, value: femGroundTruth(state.d) });
      scheduleDraw();
    });
    clear.addEventListener("click", () => { state.checks = []; scheduleDraw(); });
    const resizeObs = new ResizeObserver(() => { layoutCanvas(); scheduleDraw(); });
    resizeObs.observe(canvasWrap);
    scheduleDraw();
  }

  init();
  return { update() { scheduleDraw(); }, destroy() { container.innerHTML = ""; } };
}
