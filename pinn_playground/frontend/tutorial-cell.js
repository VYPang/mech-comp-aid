// Tutorial cell. Renders the PINN tutorial sections + their interactive
// figures into the workspace, replacing the usual three-plot layout while
// the user is on a tutorial checkpoint.
import { NUMERICAL_TUTORIAL_INTRO, NUMERICAL_TUTORIAL_SECTIONS } from "./lessons/numerical-tutorial-content.js?v=checkpoint-shell-1";
import { TUTORIAL_INTRO, TUTORIAL_SECTIONS } from "./lessons/tutorial-content.js?v=checkpoint-shell-15";

export function advanceTutorialProgress({ sectionIds, sectionId, unlockedCount, viewedSectionIds }) {
  const sectionIndex = sectionIds.findIndex((entry) => entry === sectionId);
  if (sectionIndex < 0) {
    return {
      unlockedCount,
      viewedSectionIds: [...new Set(viewedSectionIds)],
    };
  }

  return {
    unlockedCount: Math.max(
      unlockedCount,
      Math.min(sectionIds.length, sectionIndex + 2),
    ),
    viewedSectionIds: [...new Set([...viewedSectionIds, sectionId])],
  };
}

export function resolveTutorialLesson(checkpoint) {
  if (checkpoint?.cellId === "numericalTutorial") {
    return {
      progressKey: checkpoint.id,
      title: "Numerical Tutorial Notes",
      intro: NUMERICAL_TUTORIAL_INTRO,
      sections: NUMERICAL_TUTORIAL_SECTIONS,
      statusDetail: "Sections unlock in order. Open each one to unlock the FEM workspace.",
    };
  }
  return {
    progressKey: checkpoint?.id ?? "pinn-tutorial",
    title: "PINN Tutorial Notes",
    intro: TUTORIAL_INTRO,
    sections: TUTORIAL_SECTIONS,
    statusDetail: "Sections unlock in order. Open each one to unlock the next and gain access to the PINN workspace.",
  };
}

export function createTutorialCell({ ui, runtimeState, shell }) {
  const state = {
    lesson: null,
    activeSectionId: TUTORIAL_SECTIONS[0].id,
    figureInstances: new Map(),
    container: null,
    unlockedCount: 1,
    viewedSectionIds: new Set([TUTORIAL_SECTIONS[0].id]),
  };

  function enter(checkpoint) {
    state.lesson = resolveTutorialLesson(checkpoint);
    state.activeSectionId = state.lesson.sections[0].id;
    state.unlockedCount = 1;
    state.viewedSectionIds = new Set([state.lesson.sections[0].id]);
    ensureTutorialProgress();
    syncRuntimeTutorialContext();
    shell.setBottomPanelVisible(false);
    shell.setSetupPreviewVisible(false);
    hideStandardPlots(true);
    shell.setStatus("Reading the tutorial", {
      tone: "preview",
      pill: "Tutorial",
      detail: state.lesson.statusDetail,
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
        ${state.lesson.sections.map((section, index) => `
          <button
            type="button"
            class="lesson-section-tab"
            data-section-id="${section.id}"
            ${index < state.unlockedCount ? "" : "disabled"}
          >
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
    const sections = state.lesson.sections;
    const activeSection = sections.find((section) => section.id === state.activeSectionId) ?? sections[0];
    markSectionVisited(activeSection.id);
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
      <div class="lesson-intro">${state.lesson.intro}</div>
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
      ?? state.lesson.sections.find((entry) => entry.id === state.activeSectionId)
      ?? state.lesson.sections[0];
    const sectionIndex = state.lesson.sections.findIndex((entry) => entry.id === activeSection.id);
    runtimeState.tutorial = {
      active: true,
      title: state.lesson.title,
      introText: htmlToPlainText(state.lesson.intro),
      activeSectionId: activeSection.id,
      activeSectionTitle: activeSection.title,
      activeSectionText: htmlToPlainText(activeSection.body),
      activeSectionIndex: sectionIndex >= 0 ? sectionIndex + 1 : null,
      sectionCount: state.lesson.sections.length,
    };
    runtimeState.tutorialProgress = runtimeState.tutorialProgress ?? {};
    runtimeState.tutorialProgress[state.lesson.progressKey] = {
      allComplete: state.viewedSectionIds.size === state.lesson.sections.length,
      currentIndex: sectionIndex >= 0 ? sectionIndex + 1 : 1,
      currentTitle: activeSection.title,
      sectionCount: state.lesson.sections.length,
      unlockedCount: state.unlockedCount,
      viewedSectionIds: [...state.viewedSectionIds],
      updatedAt: new Date().toISOString(),
    };
    shell.refreshProgress();
    document.dispatchEvent(new CustomEvent("pinn:tutorial-context-change"));
  }

  function ensureTutorialProgress() {
    const progress = runtimeState.tutorialProgress?.[state.lesson.progressKey];
    if (!progress) {
      return;
    }
    state.unlockedCount = Math.max(1, Math.min(state.lesson.sections.length, Number(progress.unlockedCount) || 1));
    state.viewedSectionIds = new Set(progress.viewedSectionIds ?? [state.lesson.sections[0].id]);
    if (!state.viewedSectionIds.size) {
      state.viewedSectionIds.add(state.lesson.sections[0].id);
    }
    if (!state.viewedSectionIds.has(state.activeSectionId)) {
      state.activeSectionId = state.lesson.sections[Math.max(0, state.unlockedCount - 1)]?.id ?? state.lesson.sections[0].id;
    }
  }

  function markSectionVisited(sectionId) {
    const next = advanceTutorialProgress({
      sectionIds: state.lesson.sections.map((entry) => entry.id),
      sectionId,
      unlockedCount: state.unlockedCount,
      viewedSectionIds: [...state.viewedSectionIds],
    });
    state.unlockedCount = next.unlockedCount;
    state.viewedSectionIds = new Set(next.viewedSectionIds);
    renderControls();
    updateActiveTab();
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
