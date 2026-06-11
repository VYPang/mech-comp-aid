import test from "node:test";
import assert from "node:assert/strict";

import { canAdvanceCheckpoint, getCompletionMessage } from "./checkpoint-rules.js";

test("tutorial sequence advances when the last section has been viewed", () => {
  const checkpoint = {
    id: "pinn-tutorial",
    completeMode: "tutorial_sequence",
  };
  const progressState = {
    checkpoints: {
      "pinn-tutorial": { unlocked: true },
    },
  };
  const runtimeState = {
    tutorialProgress: {
      "pinn-tutorial": {
        allComplete: true,
        currentIndex: 7,
        currentTitle: "Physics-Informed Neural Networks",
        sectionCount: 7,
      },
    },
  };

  assert.equal(canAdvanceCheckpoint(checkpoint, progressState, runtimeState), true);
  assert.match(getCompletionMessage(checkpoint, runtimeState), /next workspace is now unlocked/);
});

test("tutorial sequence reports the current section while still in progress", () => {
  const checkpoint = {
    id: "pinn-tutorial",
    completeMode: "tutorial_sequence",
  };
  const runtimeState = {
    tutorialProgress: {
      "pinn-tutorial": {
        allComplete: false,
        currentIndex: 3,
        currentTitle: "Generalization",
        sectionCount: 7,
      },
    },
  };

  assert.match(getCompletionMessage(checkpoint, runtimeState), /Tutorial section 3 of 7: Generalization/);
});
