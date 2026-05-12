// Shared infrastructure for the PINN tutorial interactive figures.
//
// Architectural ground rules (after Bartosz Ciechanowski's pattern):
//   1. Math state lives in a plain object. The drawing function is pure(ish):
//      it reads state and renders, never the other way around.
//   2. All coordinates use a math domain. mapToCanvas() converts to pixels
//      so axis scale or zoom can change without touching the math code.
//   3. Slider input fires fast. We coalesce redraw requests with
//      requestAnimationFrame so we never render more than once per frame.
//   4. Pointer events are unified across mouse + touch via Pointer Events.

const DEVICE_PIXEL_RATIO = () => Math.max(1, window.devicePixelRatio || 1);

/**
 * Configure a canvas for crisp rendering on HiDPI screens.
 * Returns a 2D context already scaled to logical (CSS) pixels.
 */
export function setupCanvas(canvas, cssWidth, cssHeight) {
  const dpr = DEVICE_PIXEL_RATIO();
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/**
 * Build a coordinate mapper between a math domain and canvas pixels.
 * y axis is flipped so positive math-y points up.
 */
export function makeMapper({ xDomain, yDomain, padding = 28, width, height }) {
  const [x0, x1] = xDomain;
  const [y0, y1] = yDomain;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;
  const sx = innerW / (x1 - x0);
  const sy = innerH / (y1 - y0);
  return {
    toPx(x, y) {
      return [padding + (x - x0) * sx, padding + (y1 - y) * sy];
    },
    toMath(px, py) {
      return [x0 + (px - padding) / sx, y1 - (py - padding) / sy];
    },
    bounds: { x0, x1, y0, y1, padding, width, height, innerW, innerH },
  };
}

/**
 * Schedule a draw at most once per animation frame.
 * Cheap to call from input/pointer handlers.
 */
export function makeFrameScheduler(drawFn) {
  let pending = false;
  return function scheduleDraw() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      drawFn();
    });
  };
}

/**
 * Attach unified pointer drag support to a canvas.
 * Callbacks receive math-space coordinates via mapper.toMath.
 */
export function attachDrag(canvas, mapper, handlers = {}) {
  let activePointer = null;
  function localPos(event) {
    const rect = canvas.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  }
  canvas.style.touchAction = "none";
  canvas.addEventListener("pointerdown", (event) => {
    const [px, py] = localPos(event);
    const [mx, my] = mapper.toMath(px, py);
    const accepted = handlers.onDown?.(mx, my, { px, py, event });
    if (accepted !== false) {
      activePointer = event.pointerId;
      canvas.setPointerCapture(event.pointerId);
    }
  });
  canvas.addEventListener("pointermove", (event) => {
    const [px, py] = localPos(event);
    const [mx, my] = mapper.toMath(px, py);
    if (activePointer === event.pointerId) {
      handlers.onMove?.(mx, my, { px, py, event });
    } else {
      handlers.onHover?.(mx, my, { px, py, event });
    }
  });
  function release(event) {
    if (activePointer === event.pointerId) {
      handlers.onUp?.();
      try { canvas.releasePointerCapture(event.pointerId); } catch (_) {}
      activePointer = null;
    }
  }
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
}

/** Draw a light grid + axes inside the mapper bounds. */
export function drawAxes(ctx, mapper, options = {}) {
  const { x0, x1, y0, y1, padding, width, height } = mapper.bounds;
  const stepX = options.stepX ?? niceStep((x1 - x0) / 6);
  const stepY = options.stepY ?? niceStep((y1 - y0) / 5);
  ctx.save();
  ctx.lineWidth = 1;
  ctx.font = "11px Inter, system-ui, sans-serif";
  ctx.fillStyle = "rgba(148,163,184,0.85)";
  ctx.strokeStyle = "rgba(71,85,105,0.35)";
  ctx.beginPath();
  for (let x = Math.ceil(x0 / stepX) * stepX; x <= x1 + 1e-9; x += stepX) {
    const [px] = mapper.toPx(x, y0);
    ctx.moveTo(px, padding);
    ctx.lineTo(px, height - padding);
  }
  for (let y = Math.ceil(y0 / stepY) * stepY; y <= y1 + 1e-9; y += stepY) {
    const [, py] = mapper.toPx(x0, y);
    ctx.moveTo(padding, py);
    ctx.lineTo(width - padding, py);
  }
  ctx.stroke();
  ctx.strokeStyle = "rgba(148,163,184,0.55)";
  ctx.strokeRect(padding, padding, width - padding * 2, height - padding * 2);
  if (options.labelX !== false) {
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let x = Math.ceil(x0 / stepX) * stepX; x <= x1 + 1e-9; x += stepX) {
      const [px] = mapper.toPx(x, y0);
      ctx.fillText(formatTick(x), px, height - padding + 4);
    }
  }
  if (options.labelY !== false) {
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (let y = Math.ceil(y0 / stepY) * stepY; y <= y1 + 1e-9; y += stepY) {
      const [, py] = mapper.toPx(x0, y);
      ctx.fillText(formatTick(y), padding - 4, py);
    }
  }
  ctx.restore();
}

function niceStep(target) {
  if (target <= 0) return 1;
  const exp = Math.floor(Math.log10(target));
  const base = target / Math.pow(10, exp);
  const choices = [1, 2, 2.5, 5, 10];
  const pick = choices.find((c) => c >= base) ?? 10;
  return pick * Math.pow(10, exp);
}

function formatTick(value) {
  if (Math.abs(value) < 1e-9) return "0";
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

/**
 * Solve a 3x3 linear system A x = b with partial pivoting.
 * Returns null if singular.
 */
export function solve3(A, b) {
  const M = [
    [A[0][0], A[0][1], A[0][2], b[0]],
    [A[1][0], A[1][1], A[1][2], b[1]],
    [A[2][0], A[2][1], A[2][2], b[2]],
  ];
  for (let col = 0; col < 3; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < 3; r += 1) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-12) return null;
    if (pivot !== col) [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let r = col + 1; r < 3; r += 1) {
      const f = M[r][col] / M[col][col];
      for (let c = col; c < 4; c += 1) M[r][c] -= f * M[col][c];
    }
  }
  const x = [0, 0, 0];
  for (let r = 2; r >= 0; r -= 1) {
    let s = M[r][3];
    for (let c = r + 1; c < 3; c += 1) s -= M[r][c] * x[c];
    x[r] = s / M[r][r];
  }
  return x;
}

/**
 * Polynomial least-squares fit (degree d) given parallel arrays of x and y.
 * Returns coefficients [c0, c1, ..., cd] with prediction sum c_k * x^k.
 * Uses normal equations; fine for small d (<= ~8) used in the tutorial.
 */
export function polyFit(xs, ys, degree) {
  const n = degree + 1;
  const A = Array.from({ length: n }, () => new Array(n).fill(0));
  const rhs = new Array(n).fill(0);
  for (let i = 0; i < xs.length; i += 1) {
    const x = xs[i];
    const y = ys[i];
    let xj = 1;
    const powers = new Array(2 * n - 1);
    powers[0] = 1;
    for (let k = 1; k < powers.length; k += 1) powers[k] = powers[k - 1] * x;
    for (let r = 0; r < n; r += 1) {
      for (let c = 0; c < n; c += 1) A[r][c] += powers[r + c];
      rhs[r] += powers[r] * y;
    }
    void xj;
  }
  return gaussSolve(A, rhs);
}

function gaussSolve(A, b) {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < n; r += 1) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-12) return new Array(n).fill(0);
    if (pivot !== col) [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let r = col + 1; r < n; r += 1) {
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= n; c += 1) M[r][c] -= f * M[col][c];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r -= 1) {
    let s = M[r][n];
    for (let c = r + 1; c < n; c += 1) s -= M[r][c] * x[c];
    x[r] = s / M[r][r];
  }
  return x;
}

export function polyEval(coeffs, x) {
  let s = 0;
  for (let k = coeffs.length - 1; k >= 0; k -= 1) s = s * x + coeffs[k];
  return s;
}

/** Deterministic seeded PRNG so regenerate buttons are reproducible. */
export function makeRng(seed) {
  let state = seed >>> 0 || 1;
  return function next() {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

/** Box-Muller standard-normal sample. */
export function gauss(rng) {
  const u = Math.max(rng(), 1e-9);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Build a responsive figure shell with title, body, and footer caption. */
export function buildFigureShell(container, { title, caption } = {}) {
  container.innerHTML = "";
  container.classList.add("lesson-figure");
  const titleEl = document.createElement("div");
  titleEl.className = "lesson-figure-title";
  titleEl.textContent = title ?? "";
  const body = document.createElement("div");
  body.className = "lesson-figure-body";
  const captionEl = document.createElement("p");
  captionEl.className = "lesson-figure-caption";
  captionEl.textContent = caption ?? "";
  container.append(titleEl, body, captionEl);
  return { titleEl, body, captionEl };
}
