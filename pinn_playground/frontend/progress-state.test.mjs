import test from "node:test";
import assert from "node:assert/strict";

import { createProgressStore } from "./progress-state.js";

test("markCheckpointComplete unlocks the next checkpoint without auto-activating it", () => {
  globalThis.window = {
    localStorage: {
      getItem() {
        return null;
      },
      setItem() {},
    },
  };

  const store = createProgressStore();

  store.markCheckpointComplete("numerical-session");
  const state = store.getState();

  assert.equal(state.activeCheckpointId, "numerical-session");
  assert.equal(state.checkpoints["numerical-session"].completed, true);
  assert.equal(state.checkpoints["pinn-tutorial"].unlocked, true);
});
