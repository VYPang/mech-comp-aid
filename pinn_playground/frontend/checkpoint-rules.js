export const COMPLETE_MODES = {
  MANUAL: "manual",
  API_SUCCESS: "api_success",
  RULE: "rule",
  TASK_LIST: "task_list",
  TUTORIAL_SEQUENCE: "tutorial_sequence",
};

export function canAdvanceCheckpoint(checkpoint, progressState, runtimeState) {
  const checkpointState = progressState.checkpoints[checkpoint.id];
  if (!checkpointState?.unlocked) {
    return false;
  }

  switch (checkpoint.completeMode) {
    case COMPLETE_MODES.MANUAL:
      return true;
    case COMPLETE_MODES.API_SUCCESS:
      return runtimeState.checkpointEvents[checkpoint.id]?.status === "success";
    case COMPLETE_MODES.RULE:
      return evaluateCheckpointRules(checkpoint, runtimeState);
    case COMPLETE_MODES.TASK_LIST:
      return Boolean(runtimeState.taskProgress?.[checkpoint.id]?.allComplete);
    case COMPLETE_MODES.TUTORIAL_SEQUENCE:
      return Boolean(runtimeState.tutorialProgress?.[checkpoint.id]?.allComplete);
    default:
      return false;
  }
}

export function getCompletionMessage(checkpoint, runtimeState) {
  switch (checkpoint.completeMode) {
    case COMPLETE_MODES.MANUAL:
      return "Review the step, then continue when you are ready.";
    case COMPLETE_MODES.API_SUCCESS:
      return runtimeState.checkpointEvents[checkpoint.id]?.status === "success"
        ? "Required run complete. You can continue."
        : "Run the required solve to unlock the next step.";
    case COMPLETE_MODES.RULE:
      return "This checkpoint will use rule-based completion in a later milestone.";
    case COMPLETE_MODES.TASK_LIST:
      return getTaskListCompletionMessage(checkpoint, runtimeState);
    case COMPLETE_MODES.TUTORIAL_SEQUENCE:
      return getTutorialCompletionMessage(checkpoint, runtimeState);
    default:
      return "Completion state is unavailable.";
  }
}

function getTaskListCompletionMessage(checkpoint, runtimeState) {
  const tasks = Array.isArray(checkpoint.tasks) ? checkpoint.tasks : [];
  if (!tasks.length) {
    return "No tasks are configured for this checkpoint yet.";
  }

  const taskProgress = runtimeState.taskProgress?.[checkpoint.id];
  if (taskProgress?.allComplete) {
    return "All tasks are complete. You can continue.";
  }

  const activeTaskId = taskProgress?.activeTaskId ?? tasks[0]?.id;
  const activeIndex = Math.max(0, tasks.findIndex((task) => task.id === activeTaskId));
  const activeTask = tasks[activeIndex];
  if (!activeTask) {
    return "Start the task list to unlock the next checkpoint.";
  }

  return `Task ${activeIndex + 1} of ${tasks.length}: ${activeTask.title}.`;
}

function getTutorialCompletionMessage(checkpoint, runtimeState) {
  const progress = runtimeState.tutorialProgress?.[checkpoint.id];
  if (!progress) {
    return "Start with section 1 to unlock the tutorial progressively.";
  }
  if (progress.allComplete) {
    return "Tutorial complete. The PINN workspace is now unlocked.";
  }
  return `Tutorial section ${progress.currentIndex} of ${progress.sectionCount}: ${progress.currentTitle}.`;
}

export function evaluateCheckpointRules(checkpoint, runtimeState) {
  if (!Array.isArray(checkpoint.rules) || checkpoint.rules.length === 0) {
    return Boolean(runtimeState.checkpointEvents[checkpoint.id]?.status === "success");
  }

  return checkpoint.rules.every((rule) => evaluateSingleRule(rule, runtimeState));
}

function evaluateSingleRule(rule, runtimeState) {
  if (!rule || typeof rule !== "object") {
    return false;
  }

  const event = runtimeState.checkpointEvents[rule.checkpointId ?? ""];
  if (!event) {
    return false;
  }

  if (rule.type === "event_status") {
    return event.status === rule.value;
  }

  if (rule.type === "min_value") {
    return Number(event[rule.field]) >= Number(rule.value);
  }

  return false;
}
