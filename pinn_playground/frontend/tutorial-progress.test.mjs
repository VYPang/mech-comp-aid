import test from "node:test";
import assert from "node:assert/strict";

import { advanceTutorialProgress, resolveTutorialLesson } from "./tutorial-cell.js";

test("opening a tutorial section unlocks the next section", () => {
  const next = advanceTutorialProgress({
    sectionIds: ["intro", "fit", "generalization"],
    sectionId: "intro",
    unlockedCount: 1,
    viewedSectionIds: ["intro"],
  });

  assert.equal(next.unlockedCount, 2);
  assert.deepEqual(next.viewedSectionIds, ["intro"]);
});

test("opening a later unlocked section preserves the furthest unlock", () => {
  const next = advanceTutorialProgress({
    sectionIds: ["intro", "fit", "generalization", "mlp"],
    sectionId: "generalization",
    unlockedCount: 3,
    viewedSectionIds: ["intro", "fit"],
  });

  assert.equal(next.unlockedCount, 4);
  assert.deepEqual(next.viewedSectionIds.slice().sort(), ["generalization", "intro", "fit"].sort());
});

test("tutorial cell resolves numerical and PINN lesson content from checkpoint cell id", () => {
  const numerical = resolveTutorialLesson({ id: "numerical-tutorial", cellId: "numericalTutorial" });
  const pinn = resolveTutorialLesson({ id: "pinn-tutorial", cellId: "pinnTutorial" });

  assert.equal(numerical.progressKey, "numerical-tutorial");
  assert.equal(numerical.sections.length, 8);
  assert.match(numerical.title, /Numerical/i);

  assert.equal(pinn.progressKey, "pinn-tutorial");
  assert.equal(pinn.sections.length, 8);
  assert.match(pinn.title, /PINN/i);
});
