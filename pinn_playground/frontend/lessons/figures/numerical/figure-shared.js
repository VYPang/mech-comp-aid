import { buildFigureShell } from "../../figure-base.js?v=checkpoint-shell-15";

function parseViewBox(viewBox) {
  const [minX, minY, width, height] = String(viewBox ?? "0 0 260 260")
    .trim()
    .split(/\s+/)
    .map(Number);
  return {
    minX: Number.isFinite(minX) ? minX : 0,
    minY: Number.isFinite(minY) ? minY : 0,
    width: Number.isFinite(width) ? width : 260,
    height: Number.isFinite(height) ? height : 260,
  };
}

export function mountNumericalFigure(host, config) {
  const state = Object.fromEntries(config.controls.map((control) => [control.id, control.value]));
  const viewBox = parseViewBox(config.viewBox);
  const requiresCompute = Boolean(config.computeButtonLabel);
  const computeButtonLabel = config.computeButtonLabel ?? "Compute";
  const controlsPlacement = config.controlsPlacement ?? "sidebar";
  let computed = !requiresCompute;
  host.classList.add("numerical-concept-figure");
  const { body, captionEl } = buildFigureShell(host, {
    title: config.headline ?? config.title,
    caption: "",
  });
  captionEl.hidden = true;

  const layout = document.createElement("div");
  layout.className = "lesson-figure-grid";
  const canvasWrap = document.createElement("div");
  canvasWrap.className = "lesson-figure-canvas-wrap";
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "numerical-figure-svg");
  svg.setAttribute("viewBox", `${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", config.headline ?? config.title);
  canvasWrap.appendChild(svg);

  const sidebar = document.createElement("aside");
  sidebar.className = "lesson-figure-sidebar";
  const controls = document.createElement("div");
  controls.className = controlsPlacement === "top"
    ? "lesson-figure-controls lesson-figure-top-controls"
    : "lesson-figure-controls";
  const action = requiresCompute ? document.createElement("button") : null;
  if (action) {
    action.type = "button";
    action.className = "lesson-button";
    action.textContent = computeButtonLabel;
  }
  const stats = document.createElement("div");
  stats.className = "numerical-figure-stats";
  const hint = document.createElement("p");
  hint.className = "lesson-figure-hint";
  if (action) {
    sidebar.append(controls, stats, action, hint);
  } else {
    sidebar.append(controls, stats, hint);
  }

  if (controlsPlacement === "top") {
    body.appendChild(controls);
  }
  layout.append(canvasWrap, sidebar);
  body.appendChild(layout);

  controls.innerHTML = config.controls.map((control) => `
    <label class="lesson-control">
      <span>${control.label}</span>
      <input
        type="range"
        min="${control.min}"
        max="${control.max}"
        step="${control.step}"
        value="${control.value}"
        data-control-id="${control.id}"
      />
      <span class="lesson-control-value" data-control-value="${control.id}">${control.value}</span>
    </label>
  `).join("");

  function render() {
    const result = config.render(state, { computed });
    svg.innerHTML = `
      <rect x="${viewBox.minX}" y="${viewBox.minY}" width="${viewBox.width}" height="${viewBox.height}" rx="10" class="numerical-figure-bg" />
      ${result.svg}
    `;
    if (requiresCompute && !computed && result.prompt) {
      stats.innerHTML = `<div class="lesson-callout lesson-callout-warn">${result.prompt}</div>`;
    } else {
      stats.innerHTML = result.stats.map(([label, value]) => `
        <div class="lesson-stat-row">
          <span>${label}</span>
          <strong>${value}</strong>
        </div>
      `).join("");
    }
    hint.textContent = result.hint;
    controls.querySelectorAll("[data-control-value]").forEach((el) => {
      const id = el.dataset.controlValue;
      el.textContent = Number(state[id]).toFixed(Number.isInteger(state[id]) ? 0 : 2);
    });
    if (action) {
      action.textContent = computed ? `Recompute ${computeButtonLabel.toLowerCase()}` : computeButtonLabel;
    }
  }

  controls.querySelectorAll("input[type='range']").forEach((input) => {
    input.addEventListener("input", () => {
      state[input.dataset.controlId] = Number(input.value);
      if (requiresCompute) {
        computed = false;
      }
      render();
    });
  });

  if (action) {
    action.addEventListener("click", () => {
      computed = true;
      render();
    });
  }

  render();
  return { destroy() {} };
}