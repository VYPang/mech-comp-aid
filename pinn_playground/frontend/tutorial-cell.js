// Tutorial cell. Renders the PINN tutorial sections + their interactive
// figures into the workspace, replacing the usual three-plot layout while
// the user is on the pinn-tutorial checkpoint.
import { TUTORIAL_INTRO, TUTORIAL_SECTIONS } from "./lessons/tutorial-content.js?v=checkpoint-shell-14";

export function createTutorialCell({ ui, shell }) {
  const state = {
    activeSectionId: TUTORIAL_SECTIONS[0].id,
    figureInstances: new Map(),
    container: null,
  };

  function enter(checkpoint) {
    shell.setBottomPanelVisible(false);
    hideStandardPlots(true);
    shell.setStatus("Reading the tutorial", {
      tone: "preview",
      pill: "Tutorial",
      detail: "Work through the seven sections, then mark the checkpoint complete.",
    });
    shell.setControlsSummary("Use the section tabs below to jump between tutorial sections.");
    shell.setPlotMeta({
      leftTitle: "Tutorial",
      leftSummary: "Reading + interactive figures",
      rightTitle: "",
      rightSummary: "",
      bottomTitle: "",
      bottomSummary: "",
    });
    shell.setGuide(`
      <div class="lesson-coach">
        <p><strong>How to use this tutorial:</strong></p>
        <ul>
          <li>Read the section text first.</li>
          <li>Try the figure controls — sliders, toggles, draggable points.</li>
          <li>When you finish all seven sections, click "Mark complete and continue".</li>
        </ul>
      </div>
    `);
    renderControls();
    renderTutorialBody();
  }

  function leave() {
    destroyFigures();
    if (state.container) {
      state.container.remove();
      state.container = null;
    }
    hideStandardPlots(false);
  }

  function destroyFigures() {
    state.figureInstances.forEach((inst) => inst?.destroy?.());
    state.figureInstances.clear();
  }

  function hideStandardPlots(hide) {
    // Hide the two-plot grid + bottom panel while the tutorial owns the workspace.
    const panel = document.getElementById("bottom-panel");
    if (panel) panel.style.display = hide ? "none" : "";
    const sections = document.querySelectorAll(".plot-panel");
    sections.forEach((p) => {
      const wrapper = p.closest("section, div.rounded-2xl");
      if (wrapper) wrapper.style.display = hide ? "none" : "";
    });
  }

  function renderControls() {
    ui.controlsForm.innerHTML = `
      <div class="lesson-section-tabs" data-role="tabs">
        ${TUTORIAL_SECTIONS.map((section) => `
          <button type="button" class="lesson-section-tab" data-section-id="${section.id}">
            ${section.title}
          </button>
        `).join("")}
      </div>
    `;
    ui.controlsForm.querySelectorAll("[data-section-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.activeSectionId = btn.dataset.sectionId;
        const target = document.getElementById(`tutorial-${state.activeSectionId}`);
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
        updateActiveTab();
      });
    });
    updateActiveTab();
  }

  function updateActiveTab() {
    ui.controlsForm.querySelectorAll("[data-section-id]").forEach((btn) => {
      btn.classList.toggle("lesson-section-tab-active", btn.dataset.sectionId === state.activeSectionId);
    });
  }

  function renderTutorialBody() {
    destroyFigures();
    if (state.container) state.container.remove();
    const container = document.createElement("section");
    container.id = "tutorial-container";
    container.className = "lesson-container rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg";
    container.innerHTML = `
      <div class="lesson-intro">${TUTORIAL_INTRO}</div>
      ${TUTORIAL_SECTIONS.map((section) => `
        <article id="tutorial-${section.id}" class="lesson-section">
          <h3 class="lesson-section-title">${section.title}</h3>
          <div class="lesson-section-body">${section.body}</div>
          ${section.figureFactory ? `<div class="lesson-figure-host" data-figure-id="${section.id}"></div>` : ""}
        </article>
      `).join("")}
    `;

    // Insert the tutorial container into the main workspace area.
    const mainCol = ui.controlsForm.closest("section")?.parentElement;
    if (mainCol) {
      mainCol.appendChild(container);
    } else {
      document.body.appendChild(container);
    }
    state.container = container;

    // Mount figures.
    TUTORIAL_SECTIONS.forEach((section) => {
      if (!section.figureFactory) return;
      const host = container.querySelector(`[data-figure-id="${section.id}"]`);
      if (!host) return;
      try {
        state.figureInstances.set(section.id, section.figureFactory(host));
      } catch (err) {
        host.innerHTML = `<div class="lesson-callout lesson-callout-warn">Figure failed to load: ${err?.message ?? err}</div>`;
        // Surface to console for diagnostics.
        // eslint-disable-next-line no-console
        console.error("Tutorial figure failed", section.id, err);
      }
    });

    // Track active section as the user scrolls.
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      const id = visible.target.id.replace(/^tutorial-/, "");
      if (id !== state.activeSectionId) {
        state.activeSectionId = id;
        updateActiveTab();
      }
    }, { rootMargin: "-30% 0px -55% 0px", threshold: [0.05, 0.4, 0.8] });
    container.querySelectorAll(".lesson-section").forEach((sec) => observer.observe(sec));
    state.scrollObserver = observer;
  }

  return { enter, leave };
}
