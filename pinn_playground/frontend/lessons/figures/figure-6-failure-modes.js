// Figure 6 - Neumann versus Dirichlet boundary-condition signals.
// The visual focus is how the same neural-network output gives a direct
// displacement comparison for Dirichlet data but an indirect derivative-based
// traction comparison for Neumann data.
import {
  buildFigureShell,
  makeFrameScheduler,
  setupCanvas,
} from "../figure-base.js?v=checkpoint-shell-15";

const INNER_LO = 0.18;
const INNER_HI = 0.82;
const LOAD_MIN = 0.40;
const LOAD_MAX = 0.60;
const CANVAS_HEIGHT_RATIO = 0.64;
const PANEL_GAP = 18;
const STACKED_BREAKPOINT = 760;

export function createPinnFailureFigure(container) {
  const { body } = buildFigureShell(container, {
    title: "Figure 6 - Why Neumann loading is harder than Dirichlet loading",
    caption: "Both panels use the same neural network output. Dirichlet compares displacement directly; Neumann must differentiate displacement into stress before comparing traction.",
  });

  const controls = document.createElement("div");
  controls.className = "lesson-figure-controls";
  controls.innerHTML = `
    <label class="lesson-control"><span>Training progress</span><input type="range" min="0" max="1" step="0.01" value="0.35" data-role="progress" /><span class="lesson-control-value" data-role="progress-value">35%</span></label>
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

  const state = { progress: 0.35 };
  let ctx;
  let cssWidth = 0;
  let cssHeight = 0;
  let panels = [];
  const scheduleDraw = makeFrameScheduler(draw);

  function layoutCanvas() {
    cssWidth = canvasWrap.clientWidth || 560;
    const stacked = cssWidth < STACKED_BREAKPOINT;
    cssHeight = Math.round(cssWidth * (stacked ? 1.34 : CANVAS_HEIGHT_RATIO));
    ctx = setupCanvas(canvas, cssWidth, cssHeight);

    const outerMargin = 18;
    if (stacked) {
      const panelHeight = (cssHeight - outerMargin * 2 - PANEL_GAP) / 2;
      panels = [
        { kind: "neumann", left: outerMargin, top: outerMargin, width: cssWidth - outerMargin * 2, height: panelHeight },
        { kind: "dirichlet", left: outerMargin, top: outerMargin + panelHeight + PANEL_GAP, width: cssWidth - outerMargin * 2, height: panelHeight },
      ];
    } else {
      const panelWidth = (cssWidth - outerMargin * 2 - PANEL_GAP) / 2;
      panels = [
        { kind: "neumann", left: outerMargin, top: outerMargin, width: panelWidth, height: cssHeight - outerMargin * 2 },
        { kind: "dirichlet", left: outerMargin + panelWidth + PANEL_GAP, top: outerMargin, width: panelWidth, height: cssHeight - outerMargin * 2 },
      ];
    }
  }

  function easeOut(progress) {
    return 1 - (1 - progress) ** 2;
  }

  function directLearning(progress) {
    return 0.18 + 0.80 * easeOut(progress);
  }

  function indirectLearning(progress) {
    return 0.12 + 0.58 * progress ** 0.75;
  }

  function signalQuality(kind) {
    return kind === "dirichlet" ? directLearning(state.progress) : indirectLearning(state.progress);
  }

  function difficulty(kind) {
    return kind === "dirichlet" ? 1 - 0.88 * signalQuality(kind) : 1 - 0.55 * signalQuality(kind);
  }

  function drawRoundRect(x, y, width, height, radius, fill, stroke = null) {
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

  function drawArrow(fromX, fromY, toX, toY, color, lineWidth = 2) {
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

  function drawPanelBackground(panel) {
    const isDirichlet = panel.kind === "dirichlet";
    drawRoundRect(
      panel.left,
      panel.top,
      panel.width,
      panel.height,
      8,
      isDirichlet ? "rgba(20, 83, 45, 0.20)" : "rgba(113, 63, 18, 0.22)",
      isDirichlet ? "rgba(45, 212, 191, 0.45)" : "rgba(250, 204, 21, 0.50)",
    );
  }

  function drawPanelTitle(panel) {
    const isDirichlet = panel.kind === "dirichlet";
    ctx.save();
    ctx.fillStyle = isDirichlet ? "rgb(153, 246, 228)" : "rgb(254, 240, 138)";
    ctx.font = "600 13px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(isDirichlet ? "Dirichlet: prescribed displacement" : "Neumann: prescribed traction", panel.left + panel.width / 2, panel.top + 20);
    ctx.fillStyle = "rgba(226, 232, 240, 0.78)";
    ctx.font = "11px Inter, sans-serif";
    ctx.fillText(isDirichlet ? "compare network output directly" : "compare stress after differentiation", panel.left + panel.width / 2, panel.top + 38);
    ctx.restore();
  }

  function panelFrame(panel) {
    const availableTop = panel.top + 56;
    const availableBottom = panel.top + panel.height - 72;
    const frameSize = Math.max(74, Math.min(panel.width * 0.54, availableBottom - availableTop));
    return {
      left: panel.left + 18,
      top: availableTop + (availableBottom - availableTop - frameSize) * 0.5,
      size: frameSize,
    };
  }

  function drawFrame(frame, kind) {
    const innerLeft = frame.left + INNER_LO * frame.size;
    const innerTop = frame.top + (1 - INNER_HI) * frame.size;
    const innerSize = (INNER_HI - INNER_LO) * frame.size;
    const patchLeft = frame.left + LOAD_MIN * frame.size;
    const patchRight = frame.left + LOAD_MAX * frame.size;
    const patchMid = (patchLeft + patchRight) / 2;
    const patchY = frame.top;
    const response = signalQuality(kind);
    const displacement = kind === "dirichlet" ? 23 * response : 13 * response;

    ctx.save();
    ctx.beginPath();
    ctx.rect(frame.left, frame.top, frame.size, frame.size);
    ctx.rect(innerLeft, innerTop, innerSize, innerSize);
    ctx.fillStyle = "rgba(15, 23, 42, 0.82)";
    ctx.fill("evenodd");
    ctx.strokeStyle = "rgba(203, 213, 225, 0.82)";
    ctx.lineWidth = 1.8;
    ctx.strokeRect(frame.left, frame.top, frame.size, frame.size);
    ctx.strokeRect(innerLeft, innerTop, innerSize, innerSize);

    ctx.strokeStyle = "rgb(45, 212, 191)";
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(frame.left, frame.top + frame.size);
    ctx.lineTo(frame.left + frame.size, frame.top + frame.size);
    ctx.stroke();

    for (let index = 0; index <= 8; index += 1) {
      const hatchX = frame.left + (index / 8) * frame.size;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(hatchX - 6, frame.top + frame.size + 9);
      ctx.lineTo(hatchX + 4, frame.top + frame.size);
      ctx.stroke();
    }

    ctx.strokeStyle = kind === "dirichlet" ? "rgb(45, 212, 191)" : "rgb(250, 204, 21)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(patchLeft, patchY);
    ctx.lineTo(patchRight, patchY);
    ctx.stroke();

    if (kind === "neumann") {
      for (let index = 0; index < 4; index += 1) {
        const arrowX = patchLeft + ((index + 0.5) / 4) * (patchRight - patchLeft);
        drawArrow(arrowX, patchY - 22, arrowX, patchY - 4, "rgb(250, 204, 21)", 2);
      }
      drawArrow(patchMid + 18, patchY + 6, patchMid + 18, patchY + 6 + displacement, "rgba(248, 250, 252, 0.72)", 2.2);
    } else {
      for (let index = 0; index < 4; index += 1) {
        const arrowX = patchLeft + ((index + 0.5) / 4) * (patchRight - patchLeft);
        drawArrow(arrowX, patchY - 22, arrowX, patchY - 4, "rgb(45, 212, 191)", 2);
      }
      drawArrow(patchMid + 16, patchY + 2, patchMid + 16, patchY + 2 + displacement, "rgba(248, 250, 252, 0.78)", 2.2);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = "rgba(45, 212, 191, 0.70)";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(patchLeft, patchY + 30);
      ctx.lineTo(patchRight, patchY + 30);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  function drawSignalChain(panel, frame) {
    const isDirichlet = panel.kind === "dirichlet";
    const boxX = frame.left + frame.size + 18;
    const boxWidth = panel.left + panel.width - boxX - 14;
    const boxHeight = 24;
    const startY = frame.top + 4;
    const gap = Math.max(6, (frame.size - boxHeight * 4) / 3);
    const color = isDirichlet ? "rgb(45, 212, 191)" : "rgb(250, 204, 21)";
    const mutedFill = isDirichlet ? "rgba(20, 83, 45, 0.34)" : "rgba(113, 63, 18, 0.34)";
    const labels = isDirichlet
      ? ["coordinate (x, y)", "MLP output u, v", "target u, v", "direct error"]
      : ["coordinate (x, y)", "MLP output u, v", "differentiate to stress", "traction error"];

    ctx.save();
    labels.forEach((label, index) => {
      const y = startY + index * (boxHeight + gap);
      drawRoundRect(boxX, y, boxWidth, boxHeight, 6, mutedFill, index >= 2 && !isDirichlet ? "rgba(250, 204, 21, 0.65)" : "rgba(148, 163, 184, 0.42)");
      ctx.fillStyle = "rgba(248, 250, 252, 0.90)";
      ctx.font = index === 3 ? "600 10.5px Inter, sans-serif" : "10.5px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(label, boxX + boxWidth / 2, y + 16);
      if (index < labels.length - 1) {
        drawArrow(boxX + boxWidth / 2, y + boxHeight + 1, boxX + boxWidth / 2, y + boxHeight + gap - 2, color, 1.4);
      }
    });
    ctx.restore();
  }

  function drawErrorGauge(panel) {
    const quality = signalQuality(panel.kind);
    const error = difficulty(panel.kind);
    const x = panel.left + 20;
    const width = panel.width - 40;
    const y = panel.top + panel.height - 42;
    const fillColor = panel.kind === "dirichlet" ? "rgb(45, 212, 191)" : "rgb(250, 204, 21)";

    ctx.save();
    ctx.fillStyle = "rgba(226, 232, 240, 0.82)";
    ctx.font = "11px Inter, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(panel.kind === "dirichlet" ? "direct target signal" : "usable displacement guidance", x, y - 8);
    drawRoundRect(x, y, width, 9, 999, "rgba(15, 23, 42, 0.82)");
    drawRoundRect(x, y, Math.max(8, width * quality), 9, 999, fillColor);
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(203, 213, 225, 0.85)";
    ctx.fillText(`${Math.round((1 - error) * 100)}%`, x + width, y + 27);
    ctx.restore();
  }

  function drawPanel(panel) {
    drawPanelBackground(panel);
    drawPanelTitle(panel);
    const frame = panelFrame(panel);
    drawFrame(frame, panel.kind);
    drawSignalChain(panel, frame);
    drawErrorGauge(panel);
  }

  function updateSidebar() {
    const neumannQuality = signalQuality("neumann");
    const dirichletQuality = signalQuality("dirichlet");
    sidebar.innerHTML = `
      <div class="lesson-stat-row"><span>Neumann signal</span><strong>${Math.round(neumannQuality * 100)}%</strong></div>
      <div class="lesson-stat-row"><span>Dirichlet signal</span><strong>${Math.round(dirichletQuality * 100)}%</strong></div>
      <div class="lesson-callout lesson-callout-good">Dirichlet loss compares the model output with a prescribed displacement value at the boundary.</div>
      <ul class="lesson-figure-bullets">
        <li>Neumann: the target is traction, so the loss must pass through strain and stress before it reaches the displacement network.</li>
        <li>Dirichlet: the target is displacement, the same quantity the network already predicts.</li>
        <li>This is why a traction-loaded PINN can look plausible while still learning the load-patch response slowly.</li>
      </ul>
      <p class="lesson-figure-hint">Teacher points are one way to add Dirichlet-like displacement anchors to an otherwise Neumann-driven load patch.</p>
    `;
  }

  function draw() {
    if (!ctx) return;
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    panels.forEach(drawPanel);
    updateSidebar();
  }

  function init() {
    layoutCanvas();
    const progressInput = controls.querySelector("[data-role=progress]");
    const progressValue = controls.querySelector("[data-role=progress-value]");
    progressInput.addEventListener("input", () => {
      state.progress = parseFloat(progressInput.value);
      progressValue.textContent = `${Math.round(state.progress * 100)}%`;
      scheduleDraw();
    });
    const resizeObs = new ResizeObserver(() => { layoutCanvas(); scheduleDraw(); });
    resizeObs.observe(canvasWrap);
    scheduleDraw();
  }

  init();
  return { update() { scheduleDraw(); }, destroy() { container.innerHTML = ""; } };
}