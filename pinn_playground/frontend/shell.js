import { canAdvanceCheckpoint, getCompletionMessage } from "./checkpoint-rules.js?v=checkpoint-shell-7";
import { createNumericalCell } from "./numerical-cell.js?v=checkpoint-shell-7";
import { createPinnCell } from "./pinn-cell.js?v=checkpoint-shell-7";
import { initializeShellPlots } from "./plots.js?v=checkpoint-shell-7";

export function createAppShell({ ui, progressStore }) {
  const runtimeState = {
    checkpointEvents: {},
    fem: {},
    pinn: {},
  };
  const initialActiveCell = progressStore.getActiveCheckpoint()?.cellId ?? "numerical";
  const groupCollapsed = {
    numerical: window.matchMedia("(max-width: 1279px)").matches ? initialActiveCell !== "numerical" : false,
    pinn: window.matchMedia("(max-width: 1279px)").matches ? initialActiveCell !== "pinn" : false,
  };
  let lastActiveCell = initialActiveCell;

  const shellHelpers = {
    setGuide(html) {
      ui.guideBox.innerHTML = html;
    },
    setGuideSections(sections) {
      ui.guideBox.innerHTML = renderGuideSections(sections);
    },
    setStatus(text, options = {}) {
      const tone = options.tone ?? "idle";
      ui.statusText.textContent = text;
      ui.statusDetail.textContent = options.detail ?? "Preview, solve, and training feedback will appear here.";
      ui.statusPill.textContent = options.pill ?? statusPillLabel(tone);
      ui.statusPill.className = `status-pill ${statusPillClass(tone)}`;
    },
    setControlsSummary(text) {
      ui.controlsSummary.textContent = text;
    },
    setPlotMeta(meta) {
      ui.leftPlotTitle.textContent = meta.leftTitle;
      ui.leftPlotSummary.textContent = meta.leftSummary;
      ui.rightPlotTitle.textContent = meta.rightTitle;
      ui.rightPlotSummary.textContent = meta.rightSummary;
      ui.bottomPlotTitle.textContent = meta.bottomTitle;
      ui.bottomPlotSummary.textContent = meta.bottomSummary;
    },
    refreshProgress() {
      refreshChrome();
    },
  };

  const cells = {
    numerical: createNumericalCell({ ui, runtimeState, shell: shellHelpers }),
    pinn: createPinnCell({ ui, runtimeState, shell: shellHelpers }),
  };

  let mountedCheckpointId = null;

  initializeShellPlots({
    left: ui.leftPlot,
    right: ui.rightPlot,
    bottom: ui.bottomPlot,
  });

  ui.nextStepButton.addEventListener("click", () => {
    const state = progressStore.getState();
    const checkpoint = progressStore.getActiveCheckpoint();
    if (!checkpoint || !canAdvanceCheckpoint(checkpoint, state, runtimeState)) {
      return;
    }
    runtimeState.checkpointEvents[checkpoint.id] = {
      ...runtimeState.checkpointEvents[checkpoint.id],
      status: "success",
      completedManually: true,
    };
    progressStore.markCheckpointComplete(checkpoint.id);
  });

  ui.resetProgressButton.addEventListener("click", () => {
    if (mountedCheckpointId) {
      const checkpoint = progressStore.getCheckpoint(mountedCheckpointId);
      if (checkpoint) {
        cells[checkpoint.cellId]?.leave();
      }
    }
    mountedCheckpointId = null;
    runtimeState.checkpointEvents = {};
    runtimeState.fem = {};
    runtimeState.pinn = {};
    progressStore.reset();
    shellHelpers.setStatus("Learning path reset");
  });

  progressStore.subscribe(render);
  render(progressStore.getState());

  function render(state) {
    const checkpoint = progressStore.getActiveCheckpoint();
    if (!checkpoint) {
      return;
    }

    if (checkpoint.cellId !== lastActiveCell) {
      groupCollapsed[checkpoint.cellId] = false;
      lastActiveCell = checkpoint.cellId;
    }

    refreshChrome(state, checkpoint);

    if (mountedCheckpointId) {
      const previousCheckpoint = progressStore.getCheckpoint(mountedCheckpointId);
      if (previousCheckpoint) {
        cells[previousCheckpoint.cellId]?.leave();
      }
    }

    mountedCheckpointId = checkpoint.id;
    cells[checkpoint.cellId]?.enter(checkpoint);
  }

  function refreshChrome(stateArg = null, checkpointArg = null) {
    const state = stateArg ?? progressStore.getState();
    const checkpoint = checkpointArg ?? progressStore.getActiveCheckpoint();
    if (!checkpoint) {
      return;
    }
    renderLearningPath(state, checkpoint.id);
    renderWorkspaceHeader(checkpoint, state);
    renderCoachPanel(checkpoint, state);
    updateNextButton(checkpoint, state);
  }

  function renderLearningPath(state, activeCheckpointId) {
    ui.learningPath.innerHTML = progressStore.checkpointGroups
      .map((group) => {
        const completedCount = group.checkpoints.filter((entry) => state.checkpoints[entry.id]?.completed).length;
        const steps = group.checkpoints
          .map((checkpoint) => {
            const checkpointState = state.checkpoints[checkpoint.id];
            const isActive = checkpoint.id === activeCheckpointId;
            const statusLabel = checkpointState.completed
              ? "Completed"
              : checkpointState.unlocked
                ? (isActive ? "Active" : "Open")
                : "Locked";
            const statusClass = checkpointState.completed
              ? "path-step-status-completed"
              : checkpointState.unlocked
                ? (isActive ? "path-step-status-active" : "path-step-status-open")
                : "path-step-status-locked";
            const stepClasses = [
              "path-step",
              checkpointState.completed ? "path-step-completed" : "",
              isActive ? "path-step-active" : "",
              !checkpointState.unlocked ? "path-step-locked" : "",
            ].join(" ");

            return `
              <button
                type="button"
                class="${stepClasses}"
                data-checkpoint-id="${checkpoint.id}"
                ${checkpointState.unlocked ? "" : "disabled"}
              >
                <div class="path-step-header">
                  <div class="path-step-title">${checkpoint.title}</div>
                  <span class="path-step-status ${statusClass}">${statusLabel}</span>
                </div>
                <div class="path-step-subtitle">${checkpoint.subtitle}</div>
              </button>
            `;
          })
          .join("");

        return `
          <section class="path-group">
            <div class="path-group-header">
              <div class="path-group-meta">
                <div class="path-group-title-row">
                  <h3 class="text-sm font-semibold uppercase tracking-[0.18em] text-slate-200">${group.title}</h3>
                  <button
                    type="button"
                    class="path-group-toggle ${groupCollapsed[group.id] ? "path-group-toggle-collapsed" : ""}"
                    data-group-toggle="${group.id}"
                    aria-expanded="${String(!groupCollapsed[group.id])}"
                    aria-controls="path-group-body-${group.id}"
                    title="${groupCollapsed[group.id] ? "Expand section" : "Collapse section"}"
                  >
                    <span class="path-group-toggle-icon">▼</span>
                  </button>
                </div>
                <div class="path-group-progress">${completedCount}/${group.checkpoints.length} complete</div>
                <p class="mt-2 text-sm leading-6 text-slate-400">${group.description}</p>
              </div>
            </div>
            <div id="path-group-body-${group.id}" class="mt-4 space-y-3 ${groupCollapsed[group.id] ? "path-group-body-collapsed" : ""}">${steps}</div>
          </section>
        `;
      })
      .join("");

    ui.learningPath.querySelectorAll("[data-checkpoint-id]").forEach((button) => {
      button.addEventListener("click", () => {
        progressStore.activateCheckpoint(button.dataset.checkpointId);
      });
    });

    ui.learningPath.querySelectorAll("[data-group-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        const groupId = button.dataset.groupToggle;
        groupCollapsed[groupId] = !groupCollapsed[groupId];
        refreshChrome();
      });
    });
  }

  function renderWorkspaceHeader(checkpoint, state) {
    const checkpointState = state.checkpoints[checkpoint.id];
    const group = progressStore.checkpointGroups.find((entry) => entry.id === checkpoint.cellId);
    const absoluteIndex = progressStore.orderedCheckpointIds.indexOf(checkpoint.id) + 1;
    const groupIndex = group?.checkpoints.findIndex((entry) => entry.id === checkpoint.id) ?? 0;
    ui.workspaceCellLabel.textContent = group?.title ?? "Learning Cell";
    ui.workspaceTitle.textContent = checkpoint.title;
    ui.workspaceSubtitle.textContent = checkpoint.subtitle;
    ui.workspaceProgress.textContent = `Step ${absoluteIndex} of ${progressStore.orderedCheckpointIds.length} \u00b7 ${group?.title ?? "Learning Cell"} ${groupIndex + 1} of ${group?.checkpoints.length ?? 1}`;
    ui.controlsTitle.textContent = checkpoint.controlsTitle;
    ui.controlsSubtitle.textContent = checkpoint.controlsSubtitle;
    ui.coachSubtitle.textContent = getCompletionMessage(checkpoint, runtimeState);

    ui.workspaceBadge.textContent = checkpointState.completed ? "Completed" : "Active";
    ui.workspaceBadge.className =
      checkpointState.completed
        ? "inline-flex items-center rounded-full border border-teal-500/40 bg-teal-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-teal-200"
        : "inline-flex items-center rounded-full border border-cyan-500/40 bg-cyan-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200";
  }

  function renderCoachPanel(checkpoint) {
    ui.requirementsList.innerHTML = checkpoint.requirements
      .map(
        (requirement, index) => `
          <li class="requirement-item">
            <span class="requirement-marker">${index + 1}</span>
            <span>${requirement}</span>
          </li>
        `,
      )
      .join("");
  }

  function updateNextButton(checkpoint, state) {
    const canAdvance = canAdvanceCheckpoint(checkpoint, state, runtimeState);
    const isFinal = progressStore.orderedCheckpointIds.at(-1) === checkpoint.id;
    const isCompleted = state.checkpoints[checkpoint.id]?.completed;

    ui.nextStepButton.disabled = isCompleted && isFinal ? true : !canAdvance;
    ui.nextStepButton.classList.toggle("opacity-60", ui.nextStepButton.disabled);
    ui.nextStepButton.classList.toggle("cursor-not-allowed", ui.nextStepButton.disabled);
    ui.nextStepButton.textContent =
      isCompleted && isFinal
        ? "Learning path completed"
        : !canAdvance && checkpoint.completeMode === "api_success"
          ? "Complete the required run first"
        : isFinal
          ? "Mark learning path complete"
          : "Mark complete and continue";
  }
}

function statusPillClass(tone) {
  switch (tone) {
    case "preview":
      return "status-pill-preview";
    case "running":
      return "status-pill-running";
    case "success":
      return "status-pill-success";
    case "warning":
      return "status-pill-warning";
    case "error":
      return "status-pill-error";
    default:
      return "status-pill-idle";
  }
}

function statusPillLabel(tone) {
  switch (tone) {
    case "preview":
      return "Previewing";
    case "running":
      return "Running";
    case "success":
      return "Ready";
    case "warning":
      return "Stale";
    case "error":
      return "Error";
    default:
      return "Idle";
  }
}

function renderGuideSections(sections) {
  const validSections = sections.filter((section) => Array.isArray(section.items) && section.items.length > 0);
  if (!validSections.length) {
    return "<p>Guidance for the active checkpoint appears here.</p>";
  }

  return `
    <div class="guide-stack">
      ${validSections
        .map(
          (section) => `
            <section class="guide-section">
              <p class="guide-section-title">${section.title}</p>
              <ul class="guide-section-list">
                ${section.items.map((item) => `<li>${item}</li>`).join("")}
              </ul>
            </section>
          `,
        )
        .join("")}
    </div>
  `;
}
