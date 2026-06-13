import {
  attachDrag,
  buildFigureShell,
  makeFrameScheduler,
  setupCanvas,
} from "../../figure-base.js?v=checkpoint-shell-15";

const CANVAS_HEIGHT_RATIO = 0.76;
const DOMAIN_MARGIN = 34;
const PANEL_GAP = 18;
const LEGEND_BOX_WIDTH = 52;
const LEGEND_BAR_WIDTH = 19;
const LEGEND_GAP = 18;
const FIELD_GROUP_SCALE = 0.84;
const PATCH_MIN = 0.12;
const PATCH_MAX = 0.88;

const PATTERNS = {
  uniform: {
    label: "Uniform",
    shortLabel: "uniform",
    message: "Every nearby point carries the same value, so both directional changes are zero.",
    callout: "Equilibrium is satisfied because the field is constant in both directions.",
    sigma(x, y, amplitude) {
      void x;
      void y;
      return 0.55 * amplitude;
    },
    dx() { return 0; },
    dy() { return 0; },
  },
  xGradient: {
    label: "x-gradient",
    shortLabel: "x-gradient",
    message: "The field increases as x changes. Holding y fixed, the local x derivative is nonzero.",
    callout: "A one-direction build-up leaves a nonzero local residual in this toy equation.",
    sigma(x, y, amplitude) {
      void y;
      return amplitude * (2 * x - 1);
    },
    dx(amplitude) { return 2 * amplitude; },
    dy() { return 0; },
  },
  yGradient: {
    label: "y-gradient",
    shortLabel: "y-gradient",
    message: "The field increases as y changes. Holding x fixed, the local y derivative is nonzero.",
    callout: "This is the same local-balance warning, now coming from the y direction.",
    sigma(x, y, amplitude) {
      void x;
      return amplitude * (2 * y - 1);
    },
    dx() { return 0; },
    dy(amplitude) { return 2 * amplitude; },
  },
  balanced: {
    label: "Balanced saddle",
    shortLabel: "balanced",
    message: "The field changes in both directions, but the two directional changes cancel locally.",
    callout: "A field can vary across the body and still satisfy local equilibrium.",
    sigma(x, y, amplitude) {
      return amplitude * (x - y);
    },
    dx(amplitude) { return amplitude; },
    dy(amplitude) { return -amplitude; },
  },
};

export const analyticalFigureConfig = {
  headline: "Figure 2 - A Field Must Balance Locally",
  title: "A Field Must Balance Locally",
  controls: [
    { id: "pattern", label: "Field pattern", value: "balanced" },
    { id: "amplitude", label: "Field amplitude", min: 0.2, max: 1.8, step: 0.05, value: 1.0 },
    { id: "arrows", label: "Show derivative arrows", value: true },
  ],
};

function clamp(value, lo, hi) {
  return Math.min(hi, Math.max(lo, value));
}

function format(value) {
  if (Math.abs(value) < 0.005) return "0.00";
  return value.toFixed(2);
}

function mix(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function stressColor(value) {
  const t = clamp((value + 1.8) / 3.6, 0, 1);
  const stops = [
    [14, 116, 144],
    [34, 211, 238],
    [226, 232, 240],
    [250, 204, 21],
    [244, 114, 182],
  ];
  const scaled = t * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(scaled));
  const local = scaled - index;
  const a = stops[index];
  const b = stops[index + 1];
  return `rgb(${mix(a[0], b[0], local)}, ${mix(a[1], b[1], local)}, ${mix(a[2], b[2], local)})`;
}

function roundRect(ctx, x, y, width, height, radius, fill, stroke = null) {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

function drawArrow(ctx, fromX, fromY, toX, toY, color, lineWidth = 2) {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - 8 * Math.cos(angle - Math.PI / 6), toY - 8 * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(toX - 8 * Math.cos(angle + Math.PI / 6), toY - 8 * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function createAnalyticalFigure(host) {
  host.classList.add("numerical-concept-figure");
  const { body } = buildFigureShell(host, {
    title: analyticalFigureConfig.headline,
    caption: "Drag the local patch. A field is defined everywhere, but equilibrium is checked locally.",
  });

  const controls = document.createElement("div");
  controls.className = "lesson-figure-controls lesson-figure-top-controls";
  controls.innerHTML = `
    <label class="lesson-control">
      <span>Field pattern</span>
      <select data-role="pattern" class="lesson-field-select">
        ${Object.entries(PATTERNS).map(([id, pattern]) => `<option value="${id}">${pattern.label}</option>`).join("")}
      </select>
    </label>
    <label class="lesson-control">
      <span>Field amplitude</span>
      <input type="range" min="0.2" max="1.8" step="0.05" value="1" data-role="amplitude" />
      <span class="lesson-control-value" data-role="amplitude-value">1.00</span>
    </label>
    <label class="lesson-control lesson-control-checkbox">
      <input type="checkbox" checked data-role="arrows" />
      <span>Show derivative arrows</span>
    </label>
  `;
  body.appendChild(controls);

  const layout = document.createElement("div");
  layout.className = "lesson-figure-grid";
  const canvasWrap = document.createElement("div");
  canvasWrap.className = "lesson-figure-canvas-wrap";
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-label", "Interactive square stress field with local equilibrium probe");
  canvasWrap.appendChild(canvas);
  const sidebar = document.createElement("div");
  sidebar.className = "lesson-figure-sidebar";
  layout.append(canvasWrap, sidebar);
  body.appendChild(layout);

  const state = {
    pattern: "balanced",
    amplitude: 1,
    arrows: true,
    probe: { x: 0.58, y: 0.48 },
    dragging: false,
  };

  let ctx;
  let cssWidth = 0;
  let cssHeight = 0;
  let domain = null;
  const scheduleDraw = makeFrameScheduler(draw);

  function pattern() {
    return PATTERNS[state.pattern] ?? PATTERNS.balanced;
  }

  function toPixel(x, y) {
    return [
      domain.left + x * domain.size,
      domain.top + (1 - y) * domain.size,
    ];
  }

  function toDomain(px, py) {
    return [
      clamp((px - domain.left) / domain.size, PATCH_MIN, PATCH_MAX),
      clamp(1 - (py - domain.top) / domain.size, PATCH_MIN, PATCH_MAX),
    ];
  }

  function layoutCanvas() {
    cssWidth = canvasWrap.clientWidth || 560;
    cssHeight = Math.round(cssWidth * CANVAS_HEIGHT_RATIO);
    ctx = setupCanvas(canvas, cssWidth, cssHeight);
    const availableWidth = Math.max(260, cssWidth - DOMAIN_MARGIN * 2);
    const availableHeight = Math.max(220, cssHeight - DOMAIN_MARGIN * 2);
    const insetWidth = cssWidth >= 720 ? Math.min(220, cssWidth * 0.32) + PANEL_GAP : 0;
    const size = Math.min(
      availableHeight,
      (availableWidth - insetWidth - LEGEND_BOX_WIDTH - LEGEND_GAP) * FIELD_GROUP_SCALE,
    );
    const groupWidth = size + LEGEND_BOX_WIDTH + LEGEND_GAP;
    const centeredLeft = DOMAIN_MARGIN + Math.max(0, (availableWidth - insetWidth - groupWidth) * 0.5);
    domain = {
      left: centeredLeft,
      top: DOMAIN_MARGIN + (availableHeight - size) * 0.5,
      size,
      legendBoxWidth: LEGEND_BOX_WIDTH,
      legendBarWidth: LEGEND_BAR_WIDTH,
      legendGap: LEGEND_GAP,
      groupWidth,
    };
  }

  function drawHeatmap() {
    const current = pattern();
    const cells = 58;
    const cellSize = domain.size / cells;
    for (let row = 0; row < cells; row += 1) {
      for (let column = 0; column < cells; column += 1) {
        const x = (column + 0.5) / cells;
        const y = 1 - (row + 0.5) / cells;
        const sigma = current.sigma(x, y, state.amplitude);
        ctx.fillStyle = stressColor(sigma);
        ctx.fillRect(
          domain.left + column * cellSize,
          domain.top + row * cellSize,
          Math.ceil(cellSize) + 0.5,
          Math.ceil(cellSize) + 0.5,
        );
      }
    }
  }

  function drawDomainFrame() {
    const { left, top, size } = domain;
    ctx.save();
    ctx.strokeStyle = "rgba(226, 232, 240, 0.86)";
    ctx.lineWidth = 2;
    ctx.strokeRect(left, top, size, size);
    ctx.strokeStyle = "rgba(15, 23, 42, 0.40)";
    ctx.lineWidth = 1;
    for (let index = 1; index < 6; index += 1) {
      const p = left + (index / 6) * size;
      const q = top + (index / 6) * size;
      ctx.beginPath();
      ctx.moveTo(p, top);
      ctx.lineTo(p, top + size);
      ctx.moveTo(left, q);
      ctx.lineTo(left + size, q);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(248, 250, 252, 0.88)";
    ctx.font = "600 12px Aptos, Segoe UI, sans-serif";
    ctx.fillText("stress-like field sigma(x, y)", left, top - 12);
    ctx.textAlign = "right";
    ctx.fillText("x", left + size, top + size + 22);
    ctx.textAlign = "left";
    ctx.fillText("y", left - 18, top + 8);
    ctx.restore();
  }

  function drawDerivativeGlyphs() {
    if (!state.arrows) return;
    const current = pattern();
    const dx = current.dx(state.amplitude);
    const dy = current.dy(state.amplitude);
    const magnitude = Math.max(0.2, Math.abs(dx) + Math.abs(dy));
    const colorX = "rgba(34, 211, 238, 0.78)";
    const colorY = "rgba(250, 204, 21, 0.78)";
    for (let y = 0.22; y <= 0.82; y += 0.2) {
      for (let x = 0.22; x <= 0.82; x += 0.2) {
        const [px, py] = toPixel(x, y);
        if (Math.abs(dx) > 0.001) {
          const length = 9 + 20 * Math.abs(dx) / magnitude;
          drawArrow(ctx, px - Math.sign(dx) * length * 0.5, py, px + Math.sign(dx) * length * 0.5, py, colorX, 1.5);
        }
        if (Math.abs(dy) > 0.001) {
          const length = 9 + 20 * Math.abs(dy) / magnitude;
          drawArrow(ctx, px, py + Math.sign(dy) * length * 0.5, px, py - Math.sign(dy) * length * 0.5, colorY, 1.5);
        }
      }
    }
  }

  function drawProbePatch() {
    const [px, py] = toPixel(state.probe.x, state.probe.y);
    const size = state.patch * domain.size;
    ctx.save();
    ctx.fillStyle = "rgba(2, 6, 23, 0.22)";
    ctx.strokeStyle = state.dragging ? "rgb(250, 204, 21)" : "rgb(248, 250, 252)";
    ctx.lineWidth = state.dragging ? 3 : 2;
    ctx.strokeRect(px - size / 2, py - size / 2, size, size);
    ctx.beginPath();
    ctx.fillStyle = state.dragging ? "rgb(250, 204, 21)" : "rgb(244, 114, 182)";
    ctx.strokeStyle = "rgb(15, 23, 42)";
    ctx.lineWidth = 2;
    ctx.arc(px, py, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawLegend() {
    const width = domain.legendBarWidth;
    const height = Math.max(102, domain.size * 0.42);
    const x = domain.left + domain.size + domain.legendGap + 12;
    const y = domain.top + (domain.size - height) * 0.5;
    const gradient = ctx.createLinearGradient(x, y, x, y + height);
    gradient.addColorStop(0, stressColor(-1.8));
    gradient.addColorStop(0.5, stressColor(0));
    gradient.addColorStop(1, stressColor(1.8));
    ctx.save();
    roundRect(ctx, x - 6, y - 8, domain.legendBoxWidth, height + 16, 8, "rgba(2, 6, 23, 0.36)", "rgba(226, 232, 240, 0.16)");
    roundRect(ctx, x, y, width, height, 999, gradient, "rgba(226, 232, 240, 0.28)");
    ctx.fillStyle = "rgba(203, 213, 225, 0.88)";
    ctx.font = "10px Aptos, Segoe UI, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("high", x + 23, y + 8);
    ctx.fillText("low", x + 23, y + height - 2);
    ctx.save();
    ctx.translate(x + 28, y + height / 2 + 20);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("sigma scale", 0, 0);
    ctx.restore();
    ctx.restore();
  }

  function drawLocalPanel() {
    if (cssWidth < 720) return;
    const panel = {
      left: domain.left + domain.size + domain.legendGap + domain.legendBoxWidth + PANEL_GAP,
      top: domain.top,
      width: cssWidth - domain.left - domain.size - domain.legendGap - domain.legendBoxWidth - PANEL_GAP - DOMAIN_MARGIN,
      height: domain.size,
    };
    const current = pattern();
    const dx = current.dx(state.amplitude);
    const dy = current.dy(state.amplitude);
    const residual = dx + dy;
    const centerX = panel.left + panel.width / 2;
    const centerY = panel.top + panel.height * 0.42;
    const patch = Math.min(panel.width * 0.48, panel.height * 0.28);
    const scale = Math.min(38, 14 + 16 * Math.max(Math.abs(dx), Math.abs(dy), Math.abs(residual)));

    ctx.save();
    roundRect(ctx, panel.left, panel.top, panel.width, panel.height, 8, "rgba(15, 23, 42, 0.78)", "rgba(148, 163, 184, 0.34)");
    ctx.fillStyle = "rgba(248, 250, 252, 0.88)";
    ctx.font = "600 12px Aptos, Segoe UI, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("local equilibrium patch", centerX, panel.top + 24);
    ctx.strokeStyle = "rgba(226, 232, 240, 0.82)";
    ctx.lineWidth = 2;
    ctx.strokeRect(centerX - patch / 2, centerY - patch / 2, patch, patch);

    if (Math.abs(dx) > 0.001) {
      const direction = Math.sign(dx);
      drawArrow(ctx, centerX, centerY, centerX + direction * scale, centerY, "rgb(34, 211, 238)", 2.4);
    }
    if (Math.abs(dy) > 0.001) {
      const direction = Math.sign(dy);
      drawArrow(ctx, centerX, centerY, centerX, centerY - direction * scale, "rgb(250, 204, 21)", 2.4);
    }
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
      ctx.fillStyle = "rgba(148, 163, 184, 0.92)";
      ctx.font = "11px Aptos, Segoe UI, sans-serif";
      ctx.fillText("no local change", centerX, centerY + 4);
    }

    ctx.textAlign = "left";
    ctx.font = "11px Aptos, Segoe UI, sans-serif";
    ctx.fillStyle = "rgb(34, 211, 238)";
    ctx.fillText(`partial sigma / partial x = ${format(dx)}`, panel.left + 16, panel.top + panel.height - 58);
    ctx.fillStyle = "rgb(250, 204, 21)";
    ctx.fillText(`partial sigma / partial y = ${format(dy)}`, panel.left + 16, panel.top + panel.height - 38);
    ctx.fillStyle = Math.abs(residual) < 0.02 ? "rgb(153, 246, 228)" : "rgb(253, 224, 71)";
    ctx.font = "600 12px Aptos, Segoe UI, sans-serif";
    ctx.fillText(`sum = ${format(residual)}`, panel.left + 16, panel.top + panel.height - 16);
    ctx.restore();
  }

  function updateSidebar() {
    const current = pattern();
    const sigma = current.sigma(state.probe.x, state.probe.y, state.amplitude);
    const dx = current.dx(state.amplitude);
    const dy = current.dy(state.amplitude);
    const residual = dx + dy;
    const balanced = Math.abs(residual) < 0.02;
    sidebar.innerHTML = `
      <div class="lesson-stat-row"><span>Pattern</span><strong>${current.shortLabel}</strong></div>
      <div class="lesson-stat-row"><span>Probe (x, y)</span><strong>(${state.probe.x.toFixed(2)}, ${state.probe.y.toFixed(2)})</strong></div>
      <div class="lesson-stat-row"><span>&sigma;(x, y)</span><strong>${format(sigma)}</strong></div>
      <div class="lesson-stat-row"><span>&part;&sigma; / &part;x</span><strong>${format(dx)}</strong></div>
      <div class="lesson-stat-row"><span>&part;&sigma; / &part;y</span><strong>${format(dy)}</strong></div>
      <div class="lesson-stat-row"><span>equilibrium residual</span><strong>${format(residual)}</strong></div>
      <div class="lesson-eq">&part;&sigma; / &part;x + &part;&sigma; / &part;y = ${format(residual)}</div>
      <div class="lesson-callout ${balanced ? "lesson-callout-good" : "lesson-callout-warn"}">${current.callout}</div>
      <ol class="lesson-figure-bullets">
        <li>A field assigns a value to every position in the square.</li>
        <li>The patch samples how the field changes in x and y near one point.</li>
        <li>Local equilibrium asks whether those directional changes cancel.</li>
      </ol>
      <p class="lesson-figure-hint">${current.message} Drag the pink point to verify that the equation is local, not just a whole-domain statement.</p>
    `;
  }

  function draw() {
    if (!ctx || !domain) return;
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    roundRect(ctx, 0, 0, cssWidth, cssHeight, 10, "rgba(2, 6, 23, 0.58)");
    drawHeatmap();
    drawDerivativeGlyphs();
    drawDomainFrame();
    drawProbePatch();
    drawLegend();
    drawLocalPanel();
    updateSidebar();
  }

  function init() {
    layoutCanvas();
    const patternInput = controls.querySelector("[data-role=pattern]");
    const amplitudeInput = controls.querySelector("[data-role=amplitude]");
    const amplitudeValue = controls.querySelector("[data-role=amplitude-value]");
    const arrowsInput = controls.querySelector("[data-role=arrows]");

    patternInput.value = state.pattern;
    patternInput.addEventListener("change", () => {
      state.pattern = patternInput.value;
      scheduleDraw();
    });
    amplitudeInput.addEventListener("input", () => {
      state.amplitude = Number(amplitudeInput.value);
      amplitudeValue.textContent = state.amplitude.toFixed(2);
      scheduleDraw();
    });
    arrowsInput.addEventListener("change", () => {
      state.arrows = arrowsInput.checked;
      scheduleDraw();
    });

    const dragMapper = {
      toMath(px, py) {
        return toDomain(px, py);
      },
    };
    attachDrag(canvas, dragMapper, {
      onDown(mx, my) {
        state.probe.x = mx;
        state.probe.y = my;
        state.dragging = true;
        scheduleDraw();
        return true;
      },
      onMove(mx, my) {
        state.probe.x = mx;
        state.probe.y = my;
        scheduleDraw();
      },
      onUp() {
        state.dragging = false;
        scheduleDraw();
      },
    });

    const resizeObs = new ResizeObserver(() => {
      layoutCanvas();
      scheduleDraw();
    });
    resizeObs.observe(canvasWrap);
    scheduleDraw();
  }

  init();

  return {
    update() { scheduleDraw(); },
    destroy() { host.innerHTML = ""; },
  };
}
