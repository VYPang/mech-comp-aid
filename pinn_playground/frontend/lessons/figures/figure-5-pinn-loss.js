// Figure 5 - PINN points on the base-frame geometry.
// Shows how interior and boundary coordinates feed different physics checks.
import {
  buildFigureShell,
  makeFrameScheduler,
  setupCanvas,
} from "../figure-base.js?v=checkpoint-shell-15";

const INNER_LO = 0.18;
const INNER_HI = 0.82;
const LOAD_MIN = 0.40;
const LOAD_MAX = 0.60;
const INTERIOR_BOUNDARY_CLEARANCE = 0.01;
const INTERIOR_CORNER_CLEARANCE = 0.06;
const CANVAS_HEIGHT_RATIO = 0.78;
const TOP_LABEL_SPACE = 38;
const BOTTOM_LABEL_SPACE = 54;

const MODES = {
  interior: {
    label: "Interior collocation",
    color: "rgb(34, 211, 238)",
    point: [0.50, 0.91],
    loss: "PDE loss",
    check: "Equilibrium residual: div(sigma) should be close to 0.",
    flow: ["coordinate (x, y)", "MLP predicts displacement (u, v)", "differentiate to strain and stress", "check equilibrium residual"],
  },
  fixed: {
    label: "Fixed boundary",
    color: "rgb(45, 212, 191)",
    point: [0.50, 0.00],
    loss: "Boundary-condition loss",
    check: "Support condition: u = 0 and v = 0 on the bottom edge.",
    flow: ["boundary coordinate", "MLP predicts displacement", "compare with prescribed displacement", "penalize support error"],
  },
  load: {
    label: "Loaded boundary",
    color: "rgb(250, 204, 21)",
    point: [0.50, 1.00],
    loss: "Boundary-condition loss",
    check: "Traction condition: stress acting on the top patch should match the applied load.",
    flow: ["load-patch coordinate", "MLP predicts displacement", "differentiate to stress", "compare traction with applied load"],
  },
  free: {
    label: "Free boundary",
    color: "rgb(244, 114, 182)",
    point: [INNER_LO, 0.50],
    loss: "Boundary-condition loss",
    check: "Free-surface condition: traction should be close to 0 on the hole wall and unloaded edges.",
    flow: ["free-boundary coordinate", "MLP predicts displacement", "differentiate to stress", "penalize nonzero traction"],
  },
};

function isInsideFrame(coordX, coordY) {
  const insideOuter = coordX >= 0 && coordX <= 1 && coordY >= 0 && coordY <= 1;
  const insideHole = coordX > INNER_LO && coordX < INNER_HI && coordY > INNER_LO && coordY < INNER_HI;
  return insideOuter && !insideHole;
}

function distanceToInnerBoundary(coordX, coordY) {
  const withinInnerX = coordX >= INNER_LO && coordX <= INNER_HI;
  const withinInnerY = coordY >= INNER_LO && coordY <= INNER_HI;

  if (withinInnerX) {
    if (coordY < INNER_LO) return INNER_LO - coordY;
    if (coordY > INNER_HI) return coordY - INNER_HI;
  }

  if (withinInnerY) {
    if (coordX < INNER_LO) return INNER_LO - coordX;
    if (coordX > INNER_HI) return coordX - INNER_HI;
  }

  const innerCorners = [
    [INNER_LO, INNER_LO],
    [INNER_LO, INNER_HI],
    [INNER_HI, INNER_LO],
    [INNER_HI, INNER_HI],
  ];
  return Math.min(...innerCorners.map(([cornerX, cornerY]) => Math.hypot(coordX - cornerX, coordY - cornerY)));
}

function distanceToInnerCorner(coordX, coordY) {
  const innerCorners = [
    [INNER_LO, INNER_LO],
    [INNER_LO, INNER_HI],
    [INNER_HI, INNER_LO],
    [INNER_HI, INNER_HI],
  ];
  return Math.min(...innerCorners.map(([cornerX, cornerY]) => Math.hypot(coordX - cornerX, coordY - cornerY)));
}

function buildInteriorPoints() {
  const points = [];
  const divisions = 17;
  for (let rowIndex = 1; rowIndex < divisions; rowIndex += 1) {
    for (let columnIndex = 1; columnIndex < divisions; columnIndex += 1) {
      const coordX = columnIndex / divisions;
      const coordY = rowIndex / divisions;
      if (
        isInsideFrame(coordX, coordY)
        && distanceToInnerBoundary(coordX, coordY) >= INTERIOR_BOUNDARY_CLEARANCE
        && distanceToInnerCorner(coordX, coordY) >= INTERIOR_CORNER_CLEARANCE
      ) {
        points.push([coordX, coordY]);
      }
    }
  }
  return points;
}

function linePoints(startX, startY, endX, endY, count) {
  return Array.from({ length: count }, (_, index) => {
    const ratio = count === 1 ? 0 : index / (count - 1);
    return [startX + (endX - startX) * ratio, startY + (endY - startY) * ratio];
  });
}

function buildBoundaryPoints() {
  const fixed = linePoints(0.04, 0, 0.96, 0, 17);
  const load = linePoints(LOAD_MIN, 1, LOAD_MAX, 1, 8);
  const topLeft = linePoints(0.04, 1, LOAD_MIN - 0.035, 1, 7);
  const topRight = linePoints(LOAD_MAX + 0.035, 1, 0.96, 1, 7);
  const leftOuter = linePoints(0, 0.08, 0, 0.92, 12);
  const rightOuter = linePoints(1, 0.08, 1, 0.92, 12);
  const innerBottom = linePoints(INNER_LO, INNER_LO, INNER_HI, INNER_LO, 13);
  const innerTop = linePoints(INNER_LO, INNER_HI, INNER_HI, INNER_HI, 13);
  const innerLeft = linePoints(INNER_LO, INNER_LO, INNER_LO, INNER_HI, 13);
  const innerRight = linePoints(INNER_HI, INNER_LO, INNER_HI, INNER_HI, 13);
  return {
    fixed,
    load,
    free: [...topLeft, ...topRight, ...leftOuter, ...rightOuter, ...innerBottom, ...innerTop, ...innerLeft, ...innerRight],
  };
}

export function createPinnLossFigure(container) {
  const { body } = buildFigureShell(container, {
    title: "Figure 5 - Collocation and boundary points on the metal frame",
    caption: "Select a point type to see how a coordinate becomes a PINN physics check.",
  });

  const controls = document.createElement("div");
  controls.className = "lesson-figure-controls";
  controls.innerHTML = Object.entries(MODES).map(([mode, entry]) => `
    <button type="button" class="lesson-button" data-role="mode" data-mode="${mode}">${entry.label}</button>
  `).join("");
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

  const pointSets = {
    interior: buildInteriorPoints(),
    ...buildBoundaryPoints(),
  };
  const state = { mode: "interior" };

  let ctx;
  let cssWidth = 0;
  let cssHeight = 0;
  let frameBox = null;
  const scheduleDraw = makeFrameScheduler(draw);

  function layoutCanvas() {
    cssWidth = canvasWrap.clientWidth || 520;
    cssHeight = Math.round(cssWidth * CANVAS_HEIGHT_RATIO);
    ctx = setupCanvas(canvas, cssWidth, cssHeight);
    const availableHeight = cssHeight - TOP_LABEL_SPACE - BOTTOM_LABEL_SPACE;
    const frameSize = Math.min(cssWidth * 0.76, availableHeight);
    frameBox = {
      left: (cssWidth - frameSize) * 0.5,
      top: TOP_LABEL_SPACE + (availableHeight - frameSize) * 0.5,
      size: frameSize,
    };
  }

  function toPixel(point) {
    const [coordX, coordY] = point;
    return [
      frameBox.left + coordX * frameBox.size,
      frameBox.top + (1 - coordY) * frameBox.size,
    ];
  }

  function drawFrame() {
    const { left, top, size } = frameBox;
    const innerLeft = left + INNER_LO * size;
    const innerTop = top + (1 - INNER_HI) * size;
    const innerSize = (INNER_HI - INNER_LO) * size;

    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, size, size);
    ctx.rect(innerLeft, innerTop, innerSize, innerSize);
    ctx.fillStyle = "rgba(15, 23, 42, 0.78)";
    ctx.fill("evenodd");
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(203, 213, 225, 0.85)";
    ctx.strokeRect(left, top, size, size);
    ctx.strokeRect(innerLeft, innerTop, innerSize, innerSize);
    ctx.restore();

    drawSupport(left, top + size, size);
    drawLoadPatch(left, top, size);
  }

  function drawSupport(left, bottom, size) {
    ctx.save();
    ctx.strokeStyle = "rgb(45, 212, 191)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(left, bottom);
    ctx.lineTo(left + size, bottom);
    ctx.stroke();
    ctx.lineWidth = 1.4;
    for (let index = 0; index <= 12; index += 1) {
      const hatchX = left + (index / 12) * size;
      ctx.beginPath();
      ctx.moveTo(hatchX - 8, bottom + 12);
      ctx.lineTo(hatchX + 6, bottom);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawLoadPatch(left, top, size) {
    const patchLeft = left + LOAD_MIN * size;
    const patchRight = left + LOAD_MAX * size;
    ctx.save();
    ctx.strokeStyle = "rgb(250, 204, 21)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(patchLeft, top);
    ctx.lineTo(patchRight, top);
    ctx.stroke();
    ctx.fillStyle = "rgb(250, 204, 21)";
    for (let index = 0; index < 4; index += 1) {
      const arrowX = patchLeft + ((index + 0.5) / 4) * (patchRight - patchLeft);
      ctx.beginPath();
      ctx.moveTo(arrowX, top - 22);
      ctx.lineTo(arrowX, top - 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(arrowX, top - 2);
      ctx.lineTo(arrowX - 5, top - 10);
      ctx.lineTo(arrowX + 5, top - 10);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPoints(points, color, highlighted) {
    ctx.save();
    points.forEach((point) => {
      const [pixelX, pixelY] = toPixel(point);
      ctx.beginPath();
      ctx.fillStyle = highlighted ? color : "rgba(148, 163, 184, 0.28)";
      ctx.strokeStyle = "rgba(15, 23, 42, 0.9)";
      ctx.lineWidth = highlighted ? 1.1 : 0.6;
      ctx.arc(pixelX, pixelY, highlighted ? 3.5 : 2.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawSelectedPoint() {
    const mode = MODES[state.mode];
    const [pixelX, pixelY] = toPixel(mode.point);
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = "rgb(248, 250, 252)";
    ctx.lineWidth = 3;
    ctx.arc(pixelX, pixelY, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.fillStyle = mode.color;
    ctx.arc(pixelX, pixelY, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawLabels() {
    const { left, top, size } = frameBox;
    ctx.save();
    ctx.fillStyle = "rgba(226, 232, 240, 0.9)";
    ctx.font = "12px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("loaded top patch", left + 0.5 * size, top - 30);
    ctx.fillText("fixed bottom edge", left + 0.5 * size, top + size + 28);
    ctx.textAlign = "left";
    ctx.fillText("inner free boundary", left + INNER_LO * size + 8, top + 0.5 * size);
    ctx.restore();
  }

  function updateSidebar() {
    const mode = MODES[state.mode];
    const [coordX, coordY] = mode.point;
    sidebar.innerHTML = `
      <div class="lesson-stat-row"><span>Selected point</span><strong>${mode.label}</strong></div>
      <div class="lesson-stat-row"><span>Coordinate</span><strong>(${coordX.toFixed(2)}, ${coordY.toFixed(2)})</strong></div>
      <div class="lesson-stat-row"><span>Loss term</span><strong>${mode.loss}</strong></div>
      <div class="lesson-callout lesson-callout-good">${mode.check}</div>
      <ol class="lesson-figure-bullets">
        ${mode.flow.map((step) => `<li>${step}</li>`).join("")}
      </ol>
      <p class="lesson-figure-hint">This figure focuses on PDE and boundary-condition points. Data loss is still possible, but it is not the visual emphasis here.</p>
    `;
  }

  function updateButtons() {
    controls.querySelectorAll("[data-role=mode]").forEach((button) => {
      const active = button.dataset.mode === state.mode;
      button.classList.toggle("lesson-button-secondary", !active);
    });
  }

  function draw() {
    if (!ctx || !frameBox) return;
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    drawFrame();
    Object.entries(MODES).forEach(([modeName, mode]) => {
      drawPoints(pointSets[modeName], mode.color, state.mode === modeName);
    });
    drawSelectedPoint();
    drawLabels();
    updateSidebar();
    updateButtons();
  }

  function init() {
    layoutCanvas();
    controls.querySelectorAll("[data-role=mode]").forEach((button) => {
      button.addEventListener("click", () => {
        state.mode = button.dataset.mode;
        scheduleDraw();
      });
    });
    const resizeObs = new ResizeObserver(() => { layoutCanvas(); scheduleDraw(); });
    resizeObs.observe(canvasWrap);
    scheduleDraw();
  }

  init();
  return { update() { scheduleDraw(); }, destroy() { container.innerHTML = ""; } };
}
