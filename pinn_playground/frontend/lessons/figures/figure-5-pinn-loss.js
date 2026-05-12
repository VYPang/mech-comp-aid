// Figure 5 - Building a PINN loss from physics.
// Schematic of a 2D domain with three categories of points and three loss
// terms. Toggling categories highlights which points contribute and updates
// a small bar chart of the weighted loss decomposition.
import {
  buildFigureShell,
  makeFrameScheduler,
  makeRng,
  setupCanvas,
} from "../figure-base.js?v=checkpoint-shell-14";

function samplePoints(seed) {
  const rng = makeRng(seed);
  const interior = [];
  for (let i = 0; i < 60; i += 1) interior.push([rng() * 0.92 + 0.04, rng() * 0.88 + 0.06]);
  const boundary = [];
  for (let i = 0; i < 12; i += 1) boundary.push([i / 11, 0.02]);              // bottom (fixed)
  for (let i = 0; i < 8; i += 1) boundary.push([0.02, 0.06 + i * 0.11]);      // left free
  for (let i = 0; i < 8; i += 1) boundary.push([0.98, 0.06 + i * 0.11]);      // right free
  for (let i = 0; i < 8; i += 1) {
    const t = i / 7;
    if (t > 0.35 && t < 0.65) continue; // load patch removed
    boundary.push([t, 0.98]);
  }
  const teacher = [];
  for (let i = 0; i < 5; i += 1) teacher.push([0.36 + i * 0.07, 0.96]);     // load patch teacher
  teacher.push([0.5, 0.5]);
  teacher.push([0.3, 0.7]);
  return { interior, boundary, teacher };
}

export function createPinnLossFigure(container) {
  const { body } = buildFigureShell(container, {
    title: "Figure 5 - PINN loss = PDE + boundary + (optional) data",
    caption: "Toggle which loss terms are active. Highlighted points are the ones contributing to the current loss.",
  });

  const controls = document.createElement("div");
  controls.className = "lesson-figure-controls";
  controls.innerHTML = `
    <label class="lesson-control lesson-control-checkbox"><input type="checkbox" data-role="pde" checked /> PDE loss (interior)</label>
    <label class="lesson-control lesson-control-checkbox"><input type="checkbox" data-role="bc" checked /> BC loss (boundary)</label>
    <label class="lesson-control lesson-control-checkbox"><input type="checkbox" data-role="data" /> Teacher data loss</label>
    <label class="lesson-control"><span>w_PDE</span><input type="range" min="0" max="3" step="0.05" value="1" data-role="w-pde" /><span class="lesson-control-value" data-role="w-pde-value">1.00</span></label>
    <label class="lesson-control"><span>w_BC</span><input type="range" min="0" max="3" step="0.05" value="1" data-role="w-bc" /><span class="lesson-control-value" data-role="w-bc-value">1.00</span></label>
    <label class="lesson-control"><span>w_data</span><input type="range" min="0" max="3" step="0.05" value="1" data-role="w-data" /><span class="lesson-control-value" data-role="w-data-value">1.00</span></label>
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

  const points = samplePoints(13);
  const state = {
    pde: true, bc: true, data: false,
    wPde: 1, wBc: 1, wData: 1,
    Lpde: 0.42, Lbc: 0.18, Ldata: 0.07,
  };

  let ctx;
  let cssWidth = 0; let cssHeight = 0;
  const scheduleDraw = makeFrameScheduler(draw);

  function layoutCanvas() {
    cssWidth = canvasWrap.clientWidth || 480;
    cssHeight = Math.round(cssWidth * 0.78);
    ctx = setupCanvas(canvas, cssWidth, cssHeight);
  }

  function map(p) {
    const m = 18;
    return [m + p[0] * (cssWidth - 2 * m), m + (1 - p[1]) * (cssHeight - 2 * m)];
  }

  function drawDot(p, color, r, alpha = 1) {
    const [x, y] = map(p);
    ctx.beginPath();
    ctx.fillStyle = color.replace("ALPHA", String(alpha));
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function draw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    const m = 18;
    ctx.strokeStyle = "rgba(148,163,184,0.7)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(m, m, cssWidth - 2 * m, cssHeight - 2 * m);
    ctx.strokeStyle = "rgba(45, 212, 191, 0.85)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(m, cssHeight - m);
    ctx.lineTo(cssWidth - m, cssHeight - m);
    ctx.stroke();
    const lp0 = m + 0.36 * (cssWidth - 2 * m);
    const lp1 = m + 0.64 * (cssWidth - 2 * m);
    ctx.strokeStyle = "rgb(250, 204, 21)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(lp0, m);
    ctx.lineTo(lp1, m);
    ctx.stroke();
    for (let i = 0; i <= 4; i += 1) {
      const x = lp0 + (lp1 - lp0) * (i / 4);
      ctx.beginPath();
      ctx.moveTo(x, m - 10);
      ctx.lineTo(x, m);
      ctx.stroke();
    }

    points.interior.forEach((p) =>
      drawDot(p, "rgba(34, 211, 238, ALPHA)", state.pde ? 3.5 : 2, state.pde ? 0.95 : 0.25));
    points.boundary.forEach((p) =>
      drawDot(p, "rgba(244, 114, 182, ALPHA)", state.bc ? 4 : 2.2, state.bc ? 0.95 : 0.25));
    points.teacher.forEach((p) =>
      drawDot(p, "rgba(250, 204, 21, ALPHA)", state.data ? 5 : 2.5, state.data ? 1.0 : 0.2));

    const lp = state.pde ? state.wPde * state.Lpde : 0;
    const lb = state.bc ? state.wBc * state.Lbc : 0;
    const ld = state.data ? state.wData * state.Ldata : 0;
    const total = lp + lb + ld;
    const bar = (label, value, color) => {
      const pct = total > 0 ? (value / total) * 100 : 0;
      return `
        <div class="lesson-bar-row">
          <span class="lesson-bar-label">${label}</span>
          <div class="lesson-bar-track"><div class="lesson-bar-fill" style="width:${pct.toFixed(1)}%;background:${color}"></div></div>
          <span class="lesson-bar-value">${value.toFixed(3)}</span>
        </div>
      `;
    };
    sidebar.innerHTML = `
      <div class="lesson-stat-row"><span>Total weighted loss</span><strong>${total.toFixed(3)}</strong></div>
      ${bar("w · L<sub>PDE</sub>", lp, "rgb(34,211,238)")}
      ${bar("w · L<sub>BC</sub>", lb, "rgb(244,114,182)")}
      ${bar("w · L<sub>data</sub>", ld, "rgb(250,204,21)")}
      <p class="lesson-figure-hint">Per-category losses are illustrative constants — only the weighting and the active terms react. Real values come from training in the next checkpoint.</p>
    `;
  }

  function init() {
    layoutCanvas();
    const wireBool = (role, key) => {
      const input = controls.querySelector(`[data-role=${role}]`);
      input.addEventListener("change", () => { state[key] = input.checked; scheduleDraw(); });
    };
    const wireRange = (role, key, valueRole) => {
      const input = controls.querySelector(`[data-role=${role}]`);
      const out = controls.querySelector(`[data-role=${valueRole}]`);
      input.addEventListener("input", () => {
        state[key] = parseFloat(input.value);
        out.textContent = state[key].toFixed(2);
        scheduleDraw();
      });
    };
    wireBool("pde", "pde");
    wireBool("bc", "bc");
    wireBool("data", "data");
    wireRange("w-pde", "wPde", "w-pde-value");
    wireRange("w-bc", "wBc", "w-bc-value");
    wireRange("w-data", "wData", "w-data-value");
    const resizeObs = new ResizeObserver(() => { layoutCanvas(); scheduleDraw(); });
    resizeObs.observe(canvasWrap);
    scheduleDraw();
  }

  init();
  return { update() { scheduleDraw(); }, destroy() { container.innerHTML = ""; } };
}
