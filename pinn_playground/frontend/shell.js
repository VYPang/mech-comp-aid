import { canAdvanceCheckpoint, getCompletionMessage } from "./checkpoint-rules.js";
import { createNumericalCell } from "./numerical-cell.js";
import { createPinnCell } from "./pinn-cell.js";
import { initializeShellPlots } from "./plots.js";

export function createAppShell({ ui, progressStore }) {
  const runtimeState = {
    checkpointEvents: {},
    fem: {},
    pinn: {},
  };

  const shellHelpers = {
    setGuide(html) {
      ui.guideBox.innerHTML = html;
    },
    setStatus(text) {
      ui.statusText.textContent = text;
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
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <div class="text-sm font-semibold text-slate-100">${checkpoint.title}</div>
                    <div class="mt-1 text-xs leading-5 text-slate-400">${checkpoint.subtitle}</div>
                  </div>
                  <span class="path-step-status ${statusClass}">${statusLabel}</span>
                </div>
              </button>
            `;
          })
          .join("");

        return `
          <section class="path-group">
            <h3 class="text-sm font-semibold uppercase tracking-[0.18em] text-slate-200">${group.title}</h3>
            <p class="mt-2 text-sm leading-6 text-slate-400">${group.description}</p>
            <div class="mt-4 space-y-3">${steps}</div>
          </section>
        `;
      })
      .join("");

    ui.learningPath.querySelectorAll("[data-checkpoint-id]").forEach((button) => {
      button.addEventListener("click", () => {
        progressStore.activateCheckpoint(button.dataset.checkpointId);
      });
    });
  }

  function renderWorkspaceHeader(checkpoint, state) {
    const checkpointState = state.checkpoints[checkpoint.id];
    const group = progressStore.checkpointGroups.find((entry) => entry.id === checkpoint.cellId);
    ui.workspaceCellLabel.textContent = group?.title ?? "Learning Cell";
    ui.workspaceTitle.textContent = checkpoint.title;
    ui.workspaceSubtitle.textContent = checkpoint.subtitle;
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
        : isFinal
          ? "Mark learning path complete"
          : "Mark complete and continue";
  }
}
