// Figure 1 - Exact Quadratic Parameter Recovery
// Three draggable points fully determine a quadratic y = a x^2 + b x + c.
import {
  attachDrag,
  buildFigureShell,
  drawAxes,
  makeFrameScheduler,
  makeMapper,
  setupCanvas,
  solve3,
} from "../figure-base.js?v=checkpoint-shell-14";

export function createQuadraticFigure(container) {
  const { body, captionEl } = buildFigureShell(container, {
    title: "Figure 1 - Three exact points pin one quadratic curve",
    caption: "Drag any of the three points. The matrix system is rebuilt and re-solved on every frame.",
  });

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
    points: [
      { x: -2.0, y: 1.5 },
      { x: 0.4, y: -1.1 },
      { x: 2.2, y: 2.4 },
    ],
    coeffs: null,
    singular: false,
    dragIndex: -1,
  };

  let mapper;
  let ctx;

  const scheduleDraw = makeFrameScheduler(draw);

  function recompute() {
    const [p0, p1, p2] = state.points;
    const A = [
      [p0.x * p0.x, p0.x, 1],
      [p1.x * p1.x, p1.x, 1],
      [p2.x * p2.x, p2.x, 1],
    ];
    const b = [p0.y, p1.y, p2.y];
    const sol = solve3(A, b);
    state.coeffs = sol;
    state.singular = sol === null;
  }

  function layoutCanvas() {
    const cssWidth = canvasWrap.clientWidth || 480;
    const cssHeight = Math.round(cssWidth * 0.62);
    ctx = setupCanvas(canvas, cssWidth, cssHeight);
    mapper = makeMapper({
      xDomain: [-3.5, 3.5],
      yDomain: [-3.5, 3.5],
      width: cssWidth,
      height: cssHeight,
      padding: 32,
    });
  }

  function draw() {
    if (!ctx) return;
    const { width, height } = mapper.bounds;
    ctx.clearRect(0, 0, width, height);
    drawAxes(ctx, mapper);

    if (state.coeffs && !state.singular) {
      const [a, b, c] = state.coeffs;
      ctx.beginPath();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgb(34, 211, 238)";
      const steps = 200;
      const { x0, x1 } = mapper.bounds;
      for (let i = 0; i <= steps; i += 1) {
        const x = x0 + (x1 - x0) * (i / steps);
        const y = a * x * x + b * x + c;
        const [px, py] = mapper.toPx(x, y);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    state.points.forEach((p, idx) => {
      const [px, py] = mapper.toPx(p.x, p.y);
      ctx.beginPath();
      ctx.fillStyle = idx === state.dragIndex ? "rgb(250, 204, 21)" : "rgb(248, 250, 252)";
      ctx.strokeStyle = "rgb(15, 23, 42)";
      ctx.lineWidth = 2;
      ctx.arc(px, py, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });

    renderSidebar();
  }

  function renderSidebar() {
    const fmt = (v) => (Number.isFinite(v) ? v.toFixed(3) : "—");
    if (state.singular || !state.coeffs) {
      sidebar.innerHTML = `
        <div class="lesson-callout lesson-callout-warn">
          Two points share almost the same x. The matrix is singular and the quadratic is undefined.
        </div>
      `;
      return;
    }
    const [a, b, c] = state.coeffs;
    const sign = (v, leading = false) => (v >= 0 ? (leading ? "" : " + ") : " - ");
    sidebar.innerHTML = `
      <div class="lesson-eq">
        y = ${sign(a, true)}${Math.abs(a).toFixed(3)} x² ${sign(b)}${Math.abs(b).toFixed(3)} x ${sign(c)}${Math.abs(c).toFixed(3)}
      </div>
      <div class="lesson-matrix">
        <div class="lesson-matrix-system">
          <div class="lesson-matrix-block">
            <span class="lesson-matrix-bracket lesson-matrix-bracket-left" aria-hidden="true"></span>
            <div class="lesson-matrix-values">
              <div class="lesson-matrix-row lesson-matrix-row-compact">
                <span class="lesson-matrix-cell">${fmt(state.points[0].x ** 2)}</span>
                <span class="lesson-matrix-cell">${fmt(state.points[0].x)}</span>
                <span class="lesson-matrix-cell">1</span>
              </div>
              <div class="lesson-matrix-row lesson-matrix-row-compact">
                <span class="lesson-matrix-cell">${fmt(state.points[1].x ** 2)}</span>
                <span class="lesson-matrix-cell">${fmt(state.points[1].x)}</span>
                <span class="lesson-matrix-cell">1</span>
              </div>
              <div class="lesson-matrix-row lesson-matrix-row-compact">
                <span class="lesson-matrix-cell">${fmt(state.points[2].x ** 2)}</span>
                <span class="lesson-matrix-cell">${fmt(state.points[2].x)}</span>
                <span class="lesson-matrix-cell">1</span>
              </div>
            </div>
            <span class="lesson-matrix-bracket lesson-matrix-bracket-right" aria-hidden="true"></span>
          </div>
          <span class="lesson-matrix-operator">·</span>
          <div class="lesson-matrix-block">
            <span class="lesson-matrix-bracket lesson-matrix-bracket-left" aria-hidden="true"></span>
            <div class="lesson-matrix-values">
              <div class="lesson-matrix-row lesson-matrix-row-vector">
                <span class="lesson-matrix-cell">a</span>
              </div>
              <div class="lesson-matrix-row lesson-matrix-row-vector">
                <span class="lesson-matrix-cell">b</span>
              </div>
              <div class="lesson-matrix-row lesson-matrix-row-vector">
                <span class="lesson-matrix-cell">c</span>
              </div>
            </div>
            <span class="lesson-matrix-bracket lesson-matrix-bracket-right" aria-hidden="true"></span>
          </div>
          <span class="lesson-matrix-operator">=</span>
          <div class="lesson-matrix-block">
            <span class="lesson-matrix-bracket lesson-matrix-bracket-left" aria-hidden="true"></span>
            <div class="lesson-matrix-values">
              <div class="lesson-matrix-row lesson-matrix-row-vector">
                <span class="lesson-matrix-cell">${fmt(state.points[0].y)}</span>
              </div>
              <div class="lesson-matrix-row lesson-matrix-row-vector">
                <span class="lesson-matrix-cell">${fmt(state.points[1].y)}</span>
              </div>
              <div class="lesson-matrix-row lesson-matrix-row-vector">
                <span class="lesson-matrix-cell">${fmt(state.points[2].y)}</span>
              </div>
            </div>
            <span class="lesson-matrix-bracket lesson-matrix-bracket-right" aria-hidden="true"></span>
          </div>
        </div>
      </div>
      <p class="lesson-figure-hint">Three equations, three unknowns. The drawing math never touches pixels — pixel mapping happens once in <code>mapToCanvas</code>.</p>
    `;
  }

  function findHit(mx, my) {
    let bestIdx = -1;
    let bestDistPx = Infinity;
    state.points.forEach((p, idx) => {
      const [px, py] = mapper.toPx(p.x, p.y);
      const [mxPx, myPx] = mapper.toPx(mx, my);
      const dx = mxPx - px;
      const dy = myPx - py;
      const d = Math.hypot(dx, dy);
      if (d < bestDistPx && d < 18) {
        bestDistPx = d;
        bestIdx = idx;
      }
    });
    return bestIdx;
  }

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  function init() {
    layoutCanvas();
    recompute();
    attachDrag(canvas, mapper, {
      onDown(mx, my) {
        const idx = findHit(mx, my);
        if (idx < 0) return false;
        state.dragIndex = idx;
        scheduleDraw();
        return true;
      },
      onMove(mx, my) {
        if (state.dragIndex < 0) return;
        const p = state.points[state.dragIndex];
        p.x = clamp(mx, mapper.bounds.x0 + 0.1, mapper.bounds.x1 - 0.1);
        p.y = clamp(my, mapper.bounds.y0 + 0.1, mapper.bounds.y1 - 0.1);
        recompute();
        scheduleDraw();
      },
      onUp() {
        state.dragIndex = -1;
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
    destroy() { container.innerHTML = ""; },
  };
}
