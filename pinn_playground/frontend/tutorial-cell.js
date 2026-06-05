// Tutorial cell. Renders the PINN tutorial sections + their interactive
// figures into the workspace, replacing the usual three-plot layout while
// the user is on the pinn-tutorial checkpoint.
import { TUTORIAL_INTRO, TUTORIAL_SECTIONS } from "./lessons/tutorial-content.js?v=checkpoint-shell-15";

export function createTutorialCell({ ui, runtimeState, shell }) {
  const state = {
    activeSectionId: TUTORIAL_SECTIONS[0].id,
    figureInstances: new Map(),
    container: null,
  };

  function enter(checkpoint) {
    syncRuntimeTutorialContext();
    shell.setBottomPanelVisible(false);
    shell.setSetupPreviewVisible(false);
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
    if (runtimeState.tutorial) {
      runtimeState.tutorial.active = false;
    }
    shell.setSetupPreviewVisible(true);
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
        updateActiveTab();
        renderTutorialBody();
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
    const activeSection = TUTORIAL_SECTIONS.find((section) => section.id === state.activeSectionId) ?? TUTORIAL_SECTIONS[0];
    syncRuntimeTutorialContext(activeSection);
    let container = state.container;
    if (!container) {
      container = document.createElement("section");
      container.id = "tutorial-container";
      container.className = "lesson-container rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg";

      const mainCol = ui.controlsForm.closest("section")?.parentElement;
      if (mainCol) {
        mainCol.appendChild(container);
      } else {
        document.body.appendChild(container);
      }
      state.container = container;
    }

    container.innerHTML = `
      <div class="lesson-intro">${TUTORIAL_INTRO}</div>
      <article id="tutorial-${activeSection.id}" class="lesson-section">
        <h3 class="lesson-section-title">${activeSection.title}</h3>
        <div class="lesson-section-body">${activeSection.body}</div>
        ${activeSection.figureFactory ? `<div class="lesson-figure-host" data-figure-id="${activeSection.id}"></div>` : ""}
      </article>
    `;

    if (activeSection.figureFactory) {
      const host = container.querySelector(`[data-figure-id="${activeSection.id}"]`);
      if (host) {
        try {
          state.figureInstances.set(activeSection.id, activeSection.figureFactory(host));
        } catch (err) {
          host.innerHTML = `<div class="lesson-callout lesson-callout-warn">Figure failed to load: ${err?.message ?? err}</div>`;
          // eslint-disable-next-line no-console
          console.error("Tutorial figure failed", activeSection.id, err);
        }
      }
    }

    renderLessonMath(container);
  }

  function syncRuntimeTutorialContext(section = null) {
    const activeSection = section
      ?? TUTORIAL_SECTIONS.find((entry) => entry.id === state.activeSectionId)
      ?? TUTORIAL_SECTIONS[0];
    const sectionIndex = TUTORIAL_SECTIONS.findIndex((entry) => entry.id === activeSection.id);
    runtimeState.tutorial = {
      active: true,
      title: "PINN Tutorial Notes",
      introText: htmlToPlainText(TUTORIAL_INTRO),
      activeSectionId: activeSection.id,
      activeSectionTitle: activeSection.title,
      activeSectionText: htmlToPlainText(activeSection.body),
      activeSectionIndex: sectionIndex >= 0 ? sectionIndex + 1 : null,
      sectionCount: TUTORIAL_SECTIONS.length,
    };
    document.dispatchEvent(new CustomEvent("pinn:tutorial-context-change"));
  }

  return { enter, leave };
}

function htmlToPlainText(html) {
  const el = document.createElement("div");
  el.innerHTML = html;
  return (el.textContent ?? "").replace(/\s+/g, " ").trim();
}

function renderLessonMath(root) {
  const renderMath = window.renderMathInElement;
  if (!root || typeof renderMath !== "function") {
    return;
  }

  renderMath(root, {
    delimiters: [
      { left: "$$", right: "$$", display: true },
      { left: "\\(", right: "\\)", display: false },
      { left: "$", right: "$", display: false },
    ],
    ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code"],
    strict: "ignore",
    throwOnError: false,
  });
}
