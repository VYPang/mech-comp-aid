import test from "node:test";
import assert from "node:assert/strict";

import {
  getActiveTaskGuidance,
  getTaskGuidance,
  getTaskStatusMessage,
  summarizeTaskProgress,
} from "./task-guidance.js";

const pinnCheckpoint = {
  id: "pinn-session",
  tasks: [
    { id: "define-collocation-points", title: "Define collocation points" },
    { id: "run-pinn-training", title: "Run the PINN" },
    { id: "compare-with-numerical", title: "Compare with the numerical baseline" },
  ],
};

test("compare task exposes a deterministic action for the hidden comparison tab", () => {
  const guidance = getTaskGuidance("compare-with-numerical");

  assert.equal(guidance.primaryAction.type, "open-tab");
  assert.equal(guidance.primaryAction.targetSelector, "#pinn-tab-btn-compare-fem");
  assert.equal(guidance.primaryAction.regionSelector, "#bottom-panel");
  assert.match(guidance.explanation, /FEM/);
});

test("task guidance does not add task-level tutor actions", () => {
  const guidance = getTaskGuidance("define-geometry");

  assert.equal(guidance.secondaryActions.length, 0);
  assert.equal(guidance.details, undefined);
  assert.match(guidance.explanation, /reinforcement/);
});

test("active task guidance follows runtime task progress", () => {
  const runtimeProgress = {
    activeTaskId: "compare-with-numerical",
    tasks: {
      "define-collocation-points": { status: "completed" },
      "run-pinn-training": { status: "completed" },
      "compare-with-numerical": { status: "active" },
    },
  };

  const active = getActiveTaskGuidance(pinnCheckpoint, runtimeProgress);

  assert.equal(active.task.id, "compare-with-numerical");
  assert.equal(active.index, 3);
  assert.equal(active.total, 3);
  assert.equal(active.guidance.primaryAction.label, "Open comparison view");
});

test("task progress summary keeps completed tasks compact and future tasks quiet", () => {
  const runtimeProgress = {
    activeTaskId: "run-pinn-training",
    tasks: {
      "define-collocation-points": { status: "completed" },
      "run-pinn-training": { status: "active" },
      "compare-with-numerical": { status: "locked" },
    },
  };

  const summary = summarizeTaskProgress(pinnCheckpoint, runtimeProgress);

  assert.equal(summary.completedCount, 1);
  assert.equal(summary.totalCount, 3);
  assert.deepEqual(
    summary.items.map((item) => [item.id, item.status, item.selectable]),
    [
      ["define-collocation-points", "completed", true],
      ["run-pinn-training", "active", true],
      ["compare-with-numerical", "locked", false],
    ],
  );
});

test("task status message never uses still-needed copy", () => {
  const completedMessage = getTaskStatusMessage("define-loading-patch", "completed");
  const activeMessage = getTaskStatusMessage("define-loading-patch", "active");

  assert.match(completedMessage, /Completed/);
  assert.doesNotMatch(completedMessage, /Still needed/);
  assert.doesNotMatch(activeMessage, /Still needed/);
});
