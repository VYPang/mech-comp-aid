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

  store.markCheckpointComplete("numerical-tutorial");
  const state = store.getState();

  assert.equal(state.activeCheckpointId, "numerical-tutorial");
  assert.equal(state.checkpoints["numerical-tutorial"].completed, true);
  assert.equal(state.checkpoints["numerical-session"].unlocked, true);
});

test("learning path starts with the numerical tutorial before the FEM workspace", () => {
  globalThis.window = {
    localStorage: {
      getItem() {
        return null;
      },
      setItem() {},
    },
  };

  const store = createProgressStore();
  const state = store.getState();

  assert.deepEqual(store.orderedCheckpointIds.slice(0, 3), [
    "numerical-tutorial",
    "numerical-session",
    "pinn-tutorial",
  ]);
  assert.equal(state.activeCheckpointId, "numerical-tutorial");
  assert.equal(state.checkpoints["numerical-tutorial"].unlocked, true);
  assert.equal(state.checkpoints["numerical-session"].unlocked, false);

  store.markCheckpointComplete("numerical-tutorial");
  const nextState = store.getState();

  assert.equal(nextState.activeCheckpointId, "numerical-tutorial");
  assert.equal(nextState.checkpoints["numerical-session"].unlocked, true);
});
