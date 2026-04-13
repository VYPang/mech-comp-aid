export const COMPLETE_MODES = {
  MANUAL: "manual",
  API_SUCCESS: "api_success",
  RULE: "rule",
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
    default:
      return false;
  }
}

export function getCompletionMessage(checkpoint, runtimeState) {
  switch (checkpoint.completeMode) {
    case COMPLETE_MODES.MANUAL:
      return "Manual progression is enabled for this checkpoint.";
    case COMPLETE_MODES.API_SUCCESS:
      return runtimeState.checkpointEvents[checkpoint.id]?.status === "success"
        ? "The required solver action has succeeded."
        : "This checkpoint will unlock when the required solver action succeeds.";
    case COMPLETE_MODES.RULE:
      return "This checkpoint is reserved for rule-based completion in a future milestone.";
    default:
      return "Completion mode is not recognized.";
  }
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
