import { canAdvanceCheckpoint, getCompletionMessage } from "./checkpoint-rules.js?v=checkpoint-shell-15";
import { installDiagnosticsDebugHook } from "./diagnostics.js?v=checkpoint-shell-15";
import { createNumericalCell } from "./numerical-cell.js?v=checkpoint-shell-20";
import { createPinnCell } from "./pinn-cell.js?v=checkpoint-shell-20";
import { createTutorialCell } from "./tutorial-cell.js?v=checkpoint-shell-15";
import { initializeShellPlots } from "./plots.js?v=checkpoint-shell-20";
import { getActiveTaskGuidance, getTaskGuidance, summarizeTaskProgress } from "./task-guidance.js?v=checkpoint-shell-17";

export function createAppShell({ ui, progressStore }) {
  const runtimeState = {
    checkpointEvents: {},
    taskProgress: {},
    sharedStructuralControls: null,
    fem: {},
    pinn: {},
  };
  const initialActiveCheckpoint = progressStore.getActiveCheckpoint();
  const initialActiveGroup = findGroupId(initialActiveCheckpoint?.id) ?? "numerical";
  const groupCollapsed = {
    numerical: window.matchMedia("(max-width: 1279px)").matches ? initialActiveGroup !== "numerical" : false,
    pinn: window.matchMedia("(max-width: 1279px)").matches ? initialActiveGroup !== "pinn" : false,
  };
  let lastActiveGroup = initialActiveGroup;

  function findGroupId(checkpointId) {
    if (!checkpointId) return null;
    const group = progressStore.checkpointGroups.find((g) =>
      g.checkpoints.some((c) => c.id === checkpointId));
    return group?.id ?? null;
  }

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
      if (meta.bottomTitle !== undefined) ui.bottomPlotTitle.textContent = meta.bottomTitle;
      if (meta.bottomSummary !== undefined) ui.bottomPlotSummary.textContent = meta.bottomSummary;
    },
    setBottomPanelVisible(visible) {
      const panel = document.getElementById("bottom-panel");
      if (panel) panel.style.display = visible ? "" : "none";
    },
    scrollResultsIntoView() {
      const target = document.getElementById(ui.leftPlot)?.closest("section");
      target?.scrollIntoView({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
        block: "start",
      });
    },
    setSetupPreviewVisible(visible) {
      if (ui.setupPreviewShell) {
        ui.setupPreviewShell.style.display = visible ? "" : "none";
        ui.setupPreviewShell.parentElement?.classList.toggle("workspace-setup-grid-preview-hidden", !visible);
      }
    },
    setSetupPreviewMeta(meta) {
      if (ui.setupPreviewTitle && meta.title !== undefined) {
        ui.setupPreviewTitle.textContent = meta.title;
      }
      if (ui.setupPreviewSummary && meta.summary !== undefined) {
        ui.setupPreviewSummary.textContent = meta.summary;
      }
    },
    setSetupPreviewTabs(modes, activeModeId, onSelect) {
      if (!ui.setupPreviewTabs) return;
      if (!Array.isArray(modes) || modes.length <= 1) {
        ui.setupPreviewTabs.innerHTML = "";
        return;
      }
      ui.setupPreviewTabs.innerHTML = modes
        .map((mode) => `
          <button
            type="button"
            class="setup-preview-tab ${mode.id === activeModeId ? "setup-preview-tab-active" : ""}"
            data-setup-preview-mode="${escapeHtml(mode.id)}"
          >
            ${escapeHtml(mode.label)}
          </button>
        `)
        .join("");
      ui.setupPreviewTabs.querySelectorAll("[data-setup-preview-mode]").forEach((button) => {
        button.addEventListener("click", () => {
          onSelect?.(button.dataset.setupPreviewMode);
        });
      });
    },
    refreshProgress() {
      refreshChrome();
    },
  };

  const cells = {
    numerical: createNumericalCell({ ui, runtimeState, shell: shellHelpers }),
    pinn: createPinnCell({ ui, runtimeState, shell: shellHelpers }),
    pinnTutorial: createTutorialCell({ ui, runtimeState, shell: shellHelpers }),
  };

  installDiagnosticsDebugHook({ runtimeState, progressStore });

  let mountedCheckpointId = null;
  const selectedTaskIds = {};
  const explanationOpenByTask = {};

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
    Object.values(cells).forEach((cell) => cell.reset?.());
    runtimeState.checkpointEvents = {};
    runtimeState.taskProgress = {};
    runtimeState.sharedStructuralControls = null;
    runtimeState.fem = {};
    runtimeState.pinn = {};
    progressStore.reset();
    shellHelpers.setStatus("Learning path reset");
  });

  progressStore.subscribe(render);
  render(progressStore.getState());

  return { runtimeState, shellHelpers };

  function render(state) {
    const checkpoint = progressStore.getActiveCheckpoint();
    if (!checkpoint) {
      return;
    }

    const groupId = findGroupId(checkpoint.id) ?? checkpoint.cellId;
    if (groupId !== lastActiveGroup) {
      groupCollapsed[groupId] = false;
      lastActiveGroup = groupId;
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
    const group = progressStore.checkpointGroups.find((entry) =>
      entry.checkpoints.some((c) => c.id === checkpoint.id));
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
    const tasksBlock = ui.requirementsList?.parentElement;
    if (ui.guideBox) {
      ui.guideBox.style.display = checkpoint.cellId === "pinnTutorial" ? "" : "none";
    }
    if (tasksBlock) {
      tasksBlock.style.display = checkpoint.cellId === "pinnTutorial" ? "none" : "";
    }

    if (checkpoint.cellId === "pinnTutorial") {
      return;
    }

    const tasks = Array.isArray(checkpoint.tasks) ? checkpoint.tasks : [];
    if (!tasks.length) {
      ui.requirementsList.innerHTML = `
        <li class="task-empty-state">
          <span class="task-empty-title">No task list yet</span>
          <span class="task-empty-copy">This cell will receive its guided tasks in a later pass.</span>
        </li>
      `;
      return;
    }

    const taskProgress = runtimeState.taskProgress?.[checkpoint.id];
    const summary = summarizeTaskProgress(checkpoint, taskProgress);
    const active = getDisplayTaskGuidance(checkpoint, taskProgress, summary);
    if (!active) {
      ui.requirementsList.innerHTML = "";
      return;
    }

    ui.requirementsList.innerHTML = `
      <li class="active-task-card">
        ${renderActiveTaskCard(checkpoint, active, summary)}
      </li>
      <li class="task-progress-compact" aria-label="Checkpoint task progress">
        ${renderTaskProgressCompact(summary, active.task.id)}
      </li>
    `;
    bindGuidedTaskActions(checkpoint, summary);
  }

  function getDisplayTaskGuidance(checkpoint, taskProgress, summary) {
    const active = getActiveTaskGuidance(checkpoint, taskProgress);
    if (!active) return null;
    const selectedTaskId = selectedTaskIds[checkpoint.id];
    const selectedItem = summary.items.find((item) => item.id === selectedTaskId && item.selectable);
    if (!selectedItem) {
      selectedTaskIds[checkpoint.id] = active.task.id;
      return active;
    }
    const tasks = Array.isArray(checkpoint.tasks) ? checkpoint.tasks : [];
    const selectedIndex = tasks.findIndex((task) => task.id === selectedItem.id);
    const selectedTask = tasks[selectedIndex];
    if (!selectedTask) {
      selectedTaskIds[checkpoint.id] = active.task.id;
      return active;
    }
    return {
      task: selectedTask,
      index: selectedIndex + 1,
      total: tasks.length,
      guidance: getTaskGuidance(selectedTask.id),
      status: selectedItem.status,
    };
  }

  function renderActiveTaskCard(checkpoint, active, summary) {
    const guidance = active.guidance;
    const actions = [guidance.primaryAction, ...(guidance.secondaryActions ?? [])]
      .filter(Boolean);
    const primaryAction = actions[0];
    const secondaryActions = actions.slice(1);
    const detailKey = taskDetailKey(checkpoint.id, active.task.id);
    const isExplanationOpen = Boolean(explanationOpenByTask[detailKey]);
    return `
      <div class="active-task-topline">
        <span class="active-task-kicker">Current task</span>
        <span class="active-task-count">${summary.completedCount}/${summary.totalCount} complete</span>
      </div>
      <div class="active-task-title-row">
        <span class="active-task-number">${active.index}</span>
        <span class="active-task-title">${escapeHtml(active.task.title)}</span>
      </div>
      <p class="active-task-instruction">${escapeHtml(guidance.shortInstruction)}</p>
      <div class="active-task-actions">
        ${primaryAction ? renderTaskActionButton(primaryAction, 0, true) : ""}
        ${secondaryActions.map((action, offset) => renderTaskActionButton(action, offset + 1, false)).join("")}
      </div>
      <details class="active-task-details" data-task-explanation-key="${escapeHtml(detailKey)}" ${isExplanationOpen ? "open" : ""}>
        <summary>Explanation</summary>
        <p class="active-task-explanation">${escapeHtml(guidance.explanation)}</p>
      </details>
    `;
  }

  function renderTaskActionButton(action, index, primary) {
    const className = primary ? "task-action-button task-action-button-primary" : "task-action-button";
    return `
      <button type="button" class="${className}" data-guided-task-action="${index}">
        ${escapeHtml(action.label)}
      </button>
    `;
  }

  function renderTaskProgressCompact(summary, selectedTaskId) {
    return summary.items
      .map((item, index) => `
        <button
          type="button"
          class="task-dot task-dot-${item.status} ${item.id === selectedTaskId ? "task-dot-selected" : ""}"
          title="${escapeHtml(item.title)}"
          data-task-progress-id="${escapeHtml(item.id)}"
          ${item.selectable ? "" : "disabled"}
        >
          <span class="task-dot-index">${index + 1}</span>
          <span class="task-dot-label">${escapeHtml(taskStatusLabel(item.status))}</span>
        </button>
      `)
      .join("");
  }

  function bindGuidedTaskActions(checkpoint, summary) {
    const active = getActiveTaskGuidance(checkpoint, runtimeState.taskProgress?.[checkpoint.id]);
    if (!active) return;
    const selected = getDisplayTaskGuidance(checkpoint, runtimeState.taskProgress?.[checkpoint.id], summary);
    const actions = [selected.guidance.primaryAction, ...(selected.guidance.secondaryActions ?? [])]
      .filter(Boolean);
    ui.requirementsList.querySelectorAll("[data-guided-task-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = actions[Number(button.dataset.guidedTaskAction)];
        if (action) {
          runGuidedTaskAction(action);
        }
      });
    });
    ui.requirementsList.querySelectorAll("[data-task-explanation-key]").forEach((details) => {
      details.addEventListener("toggle", () => {
        explanationOpenByTask[details.dataset.taskExplanationKey] = details.open;
      });
    });
    ui.requirementsList.querySelectorAll("[data-task-progress-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const taskId = button.dataset.taskProgressId;
        if (!taskId || button.disabled) return;
        selectedTaskIds[checkpoint.id] = taskId;
        refreshChrome();
      });
    });
  }

  function runGuidedTaskAction(action) {
    const region = action.regionSelector ? document.querySelector(action.regionSelector) : null;
    const target = action.targetSelector ? document.querySelector(action.targetSelector) : null;
    const secondary = action.secondarySelector ? document.querySelector(action.secondarySelector) : null;

    if (target) {
      openParentDetails(target);
    }
    if (secondary) {
      openParentDetails(secondary);
    }

    if (action.type === "open-tab" && target instanceof HTMLButtonElement) {
      target.click();
    }

    const scrollTarget = action.type === "open-tab"
      ? (region ?? target ?? secondary)
      : (target ?? secondary ?? region);
    if (scrollTarget) {
      scrollTarget.scrollIntoView({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
        block: "center",
      });
    }

    window.setTimeout(() => {
      if (action.type === "open-tab") {
        highlightGuidedTarget(region);
      }
      highlightGuidedTarget(target);
      highlightGuidedTarget(secondary);
    }, action.type === "open-tab" ? 120 : 0);
  }

  function openParentDetails(element) {
    let current = element?.parentElement;
    while (current) {
      if (current.tagName === "DETAILS") {
        current.open = true;
      }
      current = current.parentElement;
    }
  }

  function highlightGuidedTarget(element) {
    if (!element) return;
    element.classList.remove("guided-task-highlight");
    void element.offsetWidth;
    element.classList.add("guided-task-highlight");
    window.setTimeout(() => {
      element.classList.remove("guided-task-highlight");
    }, 3600);
  }

  function prefersReducedMotion() {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  }

  function taskDetailKey(checkpointId, taskId) {
    return `${checkpointId}:${taskId}`;
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
        : !canAdvance && checkpoint.completeMode === "task_list"
          ? "Finish the task list first"
        : !canAdvance && checkpoint.completeMode === "api_success"
          ? "Complete the required run first"
        : isFinal
          ? "Mark learning path complete"
          : "Mark complete and continue";
  }
}

function taskStatusLabel(status) {
  switch (status) {
    case "completed":
      return "Done";
    case "active":
      return "Now";
    default:
      return "Locked";
  }
}

function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
