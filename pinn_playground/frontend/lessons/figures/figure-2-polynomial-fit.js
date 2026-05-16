// Figure 2 - Noisy polynomial curve fitting.
// Variable noisy samples from a hidden cubic + Gaussian noise.
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
} from "../figure-base.js?v=checkpoint-shell-15";

const TRUE_COEFFS = [0.4, -0.6, -0.2, 0.18]; // y = 0.4 - 0.6 x - 0.2 x^2 + 0.18 x^3

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

function edgeWeightedT(t) {
  const centered = 2 * t - 1;
  return 0.5 + Math.sign(centered) * 0.5 * Math.abs(centered) ** 0.82;
}

function regenerate(seed, nSamples) {
  const rng = makeRng(seed);
  const xs = [];
  const ys = [];
  for (let i = 0; i < nSamples; i += 1) {
    const baseT = nSamples === 1 ? 0.5 : i / (nSamples - 1);
    const jitterWidth = i === 0 || i === nSamples - 1 ? 0.015 : 0.48 / Math.max(2, nSamples - 1);
    const t = edgeWeightedT(clamp(baseT + (rng() - 0.5) * jitterWidth, 0, 1));
    const x = -2.8 + 5.6 * t;
    const yClean = polyEval(TRUE_COEFFS, x);
    const yNoisy = yClean + gauss(rng) * 0.55;
    xs.push(x);
    ys.push(yNoisy);
  }
  return { xs, ys };
}

export function createPolynomialFitFigure(container) {
  const { body, captionEl } = buildFigureShell(container, {
    title: "Figure 2 - Noisy samples, choose your polynomial degree",
    caption: "Fit quality is judged against the hidden true cubic, not only against the noisy samples.",
  });

  const controls = document.createElement("div");
  controls.className = "lesson-figure-controls";
  controls.innerHTML = `
    <label class="lesson-control">
      <span>Polynomial degree</span>
      <input type="range" min="1" max="8" step="1" value="3" data-role="degree" />
      <span class="lesson-control-value" data-role="degree-value">3</span>
    </label>
    <label class="lesson-control">
      <span>Sample points</span>
      <input type="range" min="5" max="20" step="1" value="5" data-role="samples" />
      <span class="lesson-control-value" data-role="samples-value">5</span>
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
    nSamples: 5,
    showTruth: false,
    data: regenerate(42, 5),
    coeffs: null,
    trainLoss: null,
    truthLoss: null,
    edgeLoss: null,
    validationScore: null,
    bestDegree: null,
    bestScore: null,
    fitLabel: "reasonable fit",
    fitReason: "",
    fitStatus: "ok",
  };

  let ctx;
  let mapper;
  const scheduleDraw = makeFrameScheduler(draw);

  function fit() {
    if (state.degree >= state.data.xs.length) {
      state.coeffs = null;
      state.trainLoss = null;
      state.truthLoss = null;
      state.edgeLoss = null;
      state.validationScore = null;
      state.bestDegree = null;
      state.bestScore = null;
      state.fitLabel = "no solution";
      state.fitReason = "";
      state.fitStatus = "not-enough-data";
      return;
    }

    const candidates = buildCandidateFits();
    const current = candidates.find((candidate) => candidate.degree === state.degree);
    const best = candidates.reduce((bestSoFar, candidate) =>
      candidate.validationScore < bestSoFar.validationScore ? candidate : bestSoFar,
    candidates[0]);

    state.coeffs = current.coeffs;
    state.fitStatus = "ok";
    state.trainLoss = current.trainLoss;
    state.truthLoss = current.truthLoss;
    state.edgeLoss = current.edgeLoss;
    state.validationScore = current.validationScore;
    state.bestDegree = best.degree;
    state.bestScore = best.validationScore;

    const classification = classifyCandidate(current, best);
    state.fitLabel = classification.label;
    state.fitReason = classification.reason;
  }

  function buildCandidateFits() {
    const maxDegree = Math.min(8, state.data.xs.length - 1);
    const candidates = [];
    for (let degreeCandidate = 1; degreeCandidate <= maxDegree; degreeCandidate += 1) {
      const coeffs = polyFit(state.data.xs, state.data.ys, degreeCandidate);
      const trainLoss = mseOnSamples(coeffs, state.data);
      const validation = validateAgainstTruth(coeffs);
      candidates.push({ degree: degreeCandidate, coeffs, trainLoss, ...validation });
    }
    return candidates;
  }

  function mseOnSamples(coeffs, data) {
    let sumSquares = 0;
    for (let index = 0; index < data.xs.length; index += 1) {
      const error = polyEval(coeffs, data.xs[index]) - data.ys[index];
      sumSquares += error * error;
    }
    return sumSquares / data.xs.length;
  }

  function validateAgainstTruth(coeffs) {
    let truthSquares = 0;
    let edgeSquares = 0;
    let edgeCount = 0;
    const count = 181;
    const minX = -2.8;
    const maxX = 2.8;
    for (let index = 0; index < count; index += 1) {
      const x = minX + (maxX - minX) * (index / (count - 1));
      const error = polyEval(coeffs, x) - polyEval(TRUE_COEFFS, x);
      const squared = error * error;
      truthSquares += squared;
      if (x <= -2.15 || x >= 2.15) {
        edgeSquares += squared;
        edgeCount += 1;
      }
    }
    const truthLoss = truthSquares / count;
    const edgeLoss = edgeSquares / edgeCount;
    return {
      truthLoss,
      edgeLoss,
      validationScore: truthLoss + 0.45 * edgeLoss,
    };
  }

  function classifyCandidate(current, best) {
    const tolerance = Math.max(0.002, best.validationScore * 0.1);
    const closeToBest = current.validationScore <= best.validationScore + tolerance;
    const edgeDrift = current.edgeLoss > Math.max(0.08, current.truthLoss * 1.65);
    if (closeToBest) {
      return describeReasonableFit(current, best, edgeDrift);
    }
    if (current.degree < best.degree) {
      return describeUnderfit(current, best);
    }
    return describeOverfit(current, best, edgeDrift);
  }

  function describeReasonableFit(current, best, edgeDrift) {
    if (current.degree === 1) {
      return {
        label: "reasonable fit",
        reason: "This straight line happens to work for this sample, but that is a statistics lesson rather than proof that the model form is right. Add more samples or regenerate the noisy data and the missing curvature often appears.",
      };
    }
    if (current.degree < 3) {
      return {
        label: "reasonable fit",
        reason: "This lower-order curve is acceptable for this particular sample. Because the real trend is cubic, treat that as sample luck and test whether the judgment survives more data or another noisy draw.",
      };
    }
    if (current.degree === 3) {
      return {
        label: "reasonable fit",
        reason: "This is the expected stable choice for a cubic trend. With many samples, regenerating the noisy data should usually keep this degree in the reasonable range.",
      };
    }
    if (edgeDrift) {
      return {
        label: "reasonable fit",
        reason: "This flexible curve still looks acceptable overall, but the ends are starting to drift. Regenerate the data a few times to see how quickly extra flexibility can become overfitting.",
      };
    }
    return {
      label: "reasonable fit",
      reason: "This higher-order curve happens to generalize on this draw. It has more freedom than the true cubic, so its reliability should be checked by regenerating samples rather than trusted from one run.",
    };
  }

  function describeUnderfit(current, best) {
    if (current.degree === 1) {
      return {
        label: "underfit",
        reason: "A straight line is too rigid for the cubic trend. It may look decent on a lucky small sample, but adding more points usually exposes the missing bend.",
      };
    }
    if (current.degree === 2) {
      return {
        label: "underfit",
        reason: "A quadratic can bend, but it still cannot represent the cubic change in slope across the whole domain. More samples, especially near the two ends, make that limitation clearer.",
      };
    }
    return {
      label: "underfit",
      reason: `This model is still less flexible than the best choice for this draw. The sampled data are asking for more curvature than degree ${current.degree} can reliably provide.`,
    };
  }

  function describeOverfit(current, best, edgeDrift) {
    if (edgeDrift) {
      return {
        label: "likely overfit",
        reason: "The curve is using extra freedom to chase the noisy samples, and the end behavior is pulling away from the physical trend. This is the classic warning sign for a high-order polynomial.",
      };
    }
    if (current.trainLoss < best.trainLoss) {
      return {
        label: "likely overfit",
        reason: "The training points look easier for this model, but the extra wiggle does not carry over to the underlying trend. Regenerate the data to see how unstable this advantage can be.",
      };
    }
    return {
      label: "likely overfit",
      reason: "The model is more flexible than needed for this draw. It can create shape that belongs to the noise rather than to the cubic relationship.",
    };
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
    if (state.fitStatus === "ok") drawCurve(state.coeffs, "rgb(34, 211, 238)");

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

    if (state.fitStatus !== "ok") {
      sidebar.innerHTML = `
        <div class="lesson-stat-row"><span>Sample points</span><strong>${state.nSamples}</strong></div>
        <div class="lesson-stat-row"><span>Degree</span><strong>${state.degree}</strong></div>
        <div class="lesson-callout lesson-callout-warn">No unique fit: degree ${state.degree} needs at least ${state.degree + 1} data points.</div>
        <p class="lesson-figure-hint">With only ${state.nSamples} samples, the polynomial is not uniquely identified once the number of coefficients exceeds the amount of data.</p>
      `;
      return;
    }

    const toneClass = state.fitLabel === "reasonable fit" ? "lesson-callout-good" : "lesson-callout-warn";

    sidebar.innerHTML = `
      <div class="lesson-stat-row"><span>Sample points</span><strong>${state.nSamples}</strong></div>
      <div class="lesson-stat-row"><span>Degree</span><strong>${state.degree}</strong></div>
      <div class="lesson-stat-row"><span>Training MSE</span><strong>${state.trainLoss.toFixed(4)}</strong></div>
      <div class="lesson-stat-row"><span>Truth-curve MSE</span><strong>${state.truthLoss.toFixed(4)}</strong></div>
      <div class="lesson-stat-row"><span>Endpoint MSE</span><strong>${state.edgeLoss.toFixed(4)}</strong></div>
      <div class="lesson-stat-row"><span>Best validated degree</span><strong>${state.bestDegree}</strong></div>
      <div class="lesson-callout ${toneClass}">Qualitative: ${state.fitLabel}. ${state.fitReason}</div>
      <p class="lesson-figure-hint">Try degree 3 with the maximum sample count, then keep regenerating noisy data. The judgment should become more stable when the model class matches the trend and the samples cover both ends.</p>
    `;
  }

  function init() {
    layoutCanvas();
    fit();
    const degreeInput = controls.querySelector("[data-role=degree]");
    const degreeValue = controls.querySelector("[data-role=degree-value]");
    const sampleInput = controls.querySelector("[data-role=samples]");
    const sampleValue = controls.querySelector("[data-role=samples-value]");
    const showTruth = controls.querySelector("[data-role=show-truth]");
    const regen = controls.querySelector("[data-role=regenerate]");
    degreeInput.addEventListener("input", () => {
      state.degree = parseInt(degreeInput.value, 10);
      degreeValue.textContent = String(state.degree);
      fit();
      scheduleDraw();
    });
    sampleInput.addEventListener("input", () => {
      state.nSamples = parseInt(sampleInput.value, 10);
      sampleValue.textContent = String(state.nSamples);
      state.data = regenerate(state.seed, state.nSamples);
      fit();
      scheduleDraw();
    });
    showTruth.addEventListener("change", () => {
      state.showTruth = showTruth.checked;
      scheduleDraw();
    });
    regen.addEventListener("click", () => {
      state.seed = (state.seed * 9301 + 49297) >>> 0;
      state.data = regenerate(state.seed, state.nSamples);
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
