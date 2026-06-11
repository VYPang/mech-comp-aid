import { buildFigureShell } from "../../figure-base.js?v=checkpoint-shell-15";

export function mountNumericalFigure(host, config) {
  const state = Object.fromEntries(config.controls.map((control) => [control.id, control.value]));
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
  svg.setAttribute("viewBox", "0 0 260 260");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", config.headline ?? config.title);
  canvasWrap.appendChild(svg);

  const sidebar = document.createElement("aside");
  sidebar.className = "lesson-figure-sidebar";
  const controls = document.createElement("div");
  controls.className = "lesson-figure-controls";
  const stats = document.createElement("div");
  stats.className = "numerical-figure-stats";
  const hint = document.createElement("p");
  hint.className = "lesson-figure-hint";
  sidebar.append(controls, stats, hint);

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
    const result = config.render(state);
    svg.innerHTML = `
      <rect x="0" y="0" width="260" height="260" rx="10" class="numerical-figure-bg" />
      ${result.svg}
    `;
    stats.innerHTML = result.stats.map(([label, value]) => `
      <div class="lesson-stat-row">
        <span>${label}</span>
        <strong>${value}</strong>
      </div>
    `).join("");
    hint.textContent = result.hint;
    controls.querySelectorAll("[data-control-value]").forEach((el) => {
      const id = el.dataset.controlValue;
      el.textContent = Number(state[id]).toFixed(Number.isInteger(state[id]) ? 0 : 2);
    });
  }

  controls.querySelectorAll("input[type='range']").forEach((input) => {
    input.addEventListener("input", () => {
      state[input.dataset.controlId] = Number(input.value);
      render();
    });
  });

  render();
  return { destroy() {} };
}