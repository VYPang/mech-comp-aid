// Figure 6 - PINN failure modes and fixes.
// A toy "predicted" displacement field is built from a few knobs. Compare it
// to a fixed reference field. The knobs (normalization, teacher count,
// weights, BC type) move the predicted field toward or away from the
// reference, illustrating common PINN failure / fix patterns.
import {
  buildFigureShell,
  makeFrameScheduler,
  setupCanvas,
} from "../figure-base.js?v=checkpoint-shell-14";

const NX = 28;
const NY = 28;

function referenceField(x, y) {
  // Toy "FEM" field: bending-like, anchored at bottom, peak under load patch.
  const loadCenter = 0.5;
  const lobe = Math.exp(-((x - loadCenter) ** 2) / 0.05);
  return (1 - y) * 0 + y * (0.7 + 0.6 * lobe);
}

function predictedField(x, y, knobs) {
  const { norm, weightPde, weightBc, teacher, neumann } = knobs;
  // Without normalization, capacity is wasted -> field is too smooth.
  const sharpness = norm ? 0.05 : 0.18;
  const lobe = Math.exp(-((x - 0.5) ** 2) / sharpness);
  // Plain Neumann case under-predicts magnitude.
  const magnitudeCeiling = neumann ? 0.55 : 0.95;
  // Teacher data lifts the ceiling near the load patch.
  const teacherLift = Math.min(0.4, teacher * 0.06)
    * Math.exp(-((x - 0.5) ** 2) / 0.03)
    * Math.max(0, y - 0.6);
  // Loss balancing: too small wBc lets the bottom drift up.
  const baseDrift = Math.max(0, 0.25 - weightBc * 0.25) * (1 - y);
  // Too large wPde overdamps the peak.
  const damp = Math.max(0.4, 1 - 0.1 * Math.max(0, weightPde - 1));
  return y * (0.7 + magnitudeCeiling * lobe * damp) + teacherLift + baseDrift;
}

export function createPinnFailureFigure(container) {
  const { body } = buildFigureShell(container, {
    title: "Figure 6 - Failure modes side-by-side",
    caption: "Left: predicted field. Right: trusted reference field. Try the controls one at a time.",
  });

  const controls = document.createElement("div");
  controls.className = "lesson-figure-controls";
  controls.innerHTML = `
    <label class="lesson-control lesson-control-checkbox"><input type="checkbox" data-role="norm" checked /> Input normalization on</label>
    <label class="lesson-control lesson-control-checkbox"><input type="checkbox" data-role="neumann" checked /> Neumann (traction) load</label>
    <label class="lesson-control"><span>Teacher points on patch</span><input type="range" min="0" max="8" step="1" value="0" data-role="teacher" /><span class="lesson-control-value" data-role="teacher-value">0</span></label>
    <label class="lesson-control"><span>w_PDE</span><input type="range" min="0.2" max="3" step="0.05" value="1" data-role="w-pde" /><span class="lesson-control-value" data-role="w-pde-value">1.00</span></label>
    <label class="lesson-control"><span>w_BC</span><input type="range" min="0.05" max="3" step="0.05" value="1" data-role="w-bc" /><span class="lesson-control-value" data-role="w-bc-value">1.00</span></label>
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

  const state = { norm: true, neumann: true, teacher: 0, weightPde: 1, weightBc: 1 };

  let ctx; let cssWidth = 0; let cssHeight = 0;
  const scheduleDraw = makeFrameScheduler(draw);

  function layoutCanvas() {
    cssWidth = canvasWrap.clientWidth || 520;
    cssHeight = Math.round(cssWidth * 0.5);
    ctx = setupCanvas(canvas, cssWidth, cssHeight);
  }

  function colorFor(v, vmax) {
    const t = Math.max(0, Math.min(1, v / vmax));
    // viridis-ish 3-stop interpolation
    const stops = [
      [68, 1, 84],
      [33, 145, 140],
      [253, 231, 37],
    ];
    const seg = t < 0.5 ? 0 : 1;
    const local = (t - seg * 0.5) / 0.5;
    const a = stops[seg];
    const b = stops[seg + 1];
    const r = Math.round(a[0] + (b[0] - a[0]) * local);
    const g = Math.round(a[1] + (b[1] - a[1]) * local);
    const bl = Math.round(a[2] + (b[2] - a[2]) * local);
    return `rgb(${r},${g},${bl})`;
  }

  function drawField(x0, y0, w, h, sample, vmax, label) {
    const cellW = w / NX;
    const cellH = h / NY;
    for (let i = 0; i < NX; i += 1) {
      for (let j = 0; j < NY; j += 1) {
        const x = (i + 0.5) / NX;
        const y = (j + 0.5) / NY;
        const v = sample(x, y);
        ctx.fillStyle = colorFor(v, vmax);
        ctx.fillRect(x0 + i * cellW, y0 + (NY - 1 - j) * cellH, cellW + 1, cellH + 1);
      }
    }
    ctx.strokeStyle = "rgba(148,163,184,0.7)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x0, y0, w, h);
    ctx.fillStyle = "rgba(226,232,240,0.95)";
    ctx.font = "12px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, x0 + w / 2, y0 - 6);
  }

  function rmse() {
    let s = 0;
    let n = 0;
    for (let i = 0; i < 14; i += 1) {
      for (let j = 0; j < 14; j += 1) {
        const x = (i + 0.5) / 14;
        const y = (j + 0.5) / 14;
        const e = predictedField(x, y, state) - referenceField(x, y);
        s += e * e;
        n += 1;
      }
    }
    return Math.sqrt(s / n);
  }

  function draw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    const margin = 24;
    const panelW = (cssWidth - margin * 3) / 2;
    const panelH = cssHeight - margin * 2;
    const vmax = 1.6;
    drawField(margin, margin, panelW, panelH,
      (x, y) => predictedField(x, y, state), vmax, "PINN prediction");
    drawField(margin * 2 + panelW, margin, panelW, panelH,
      referenceField, vmax, "Reference field");

    const err = rmse();
    sidebar.innerHTML = `
      <div class="lesson-stat-row"><span>Field RMSE vs reference</span><strong>${err.toFixed(3)}</strong></div>
      <ul class="lesson-figure-bullets">
        <li>${state.norm ? "Normalization on — capacity well used." : "Normalization off — predicted field is over-smooth."}</li>
        <li>${state.neumann ? "Neumann load — magnitude tends to under-shoot the reference." : "Dirichlet load — direct supervision keeps magnitude correct."}</li>
        <li>${state.teacher > 0 ? `${state.teacher} teacher points lift the load-patch response.` : "No teacher points — the model only sees indirect traction signal."}</li>
        <li>${state.weightBc < 0.4 ? "w_BC too small — boundary drift visible at the support." : "w_BC large enough to anchor the support."}</li>
        <li>${state.weightPde > 2 ? "w_PDE very large — interior over-damps the peak." : "w_PDE reasonable."}</li>
      </ul>
    `;
  }

  function init() {
    layoutCanvas();
    const wireBool = (role, key) => {
      const input = controls.querySelector(`[data-role=${role}]`);
      input.addEventListener("change", () => { state[key] = input.checked; scheduleDraw(); });
    };
    const wireInt = (role, key, valueRole) => {
      const input = controls.querySelector(`[data-role=${role}]`);
      const out = controls.querySelector(`[data-role=${valueRole}]`);
      input.addEventListener("input", () => {
        state[key] = parseInt(input.value, 10);
        out.textContent = String(state[key]);
        scheduleDraw();
      });
    };
    const wireFloat = (role, key, valueRole) => {
      const input = controls.querySelector(`[data-role=${role}]`);
      const out = controls.querySelector(`[data-role=${valueRole}]`);
      input.addEventListener("input", () => {
        state[key] = parseFloat(input.value);
        out.textContent = state[key].toFixed(2);
        scheduleDraw();
      });
    };
    wireBool("norm", "norm");
    wireBool("neumann", "neumann");
    wireInt("teacher", "teacher", "teacher-value");
    wireFloat("w-pde", "weightPde", "w-pde-value");
    wireFloat("w-bc", "weightBc", "w-bc-value");
    const resizeObs = new ResizeObserver(() => { layoutCanvas(); scheduleDraw(); });
    resizeObs.observe(canvasWrap);
    scheduleDraw();
  }

  init();
  return { update() { scheduleDraw(); }, destroy() { container.innerHTML = ""; } };
}
