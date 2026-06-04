import test from "node:test";
import assert from "node:assert/strict";

import { buildNumericalTaskChecks } from "./numerical-task-progress.js";

test("mesh density task requires both target mesh and a completed solve", () => {
  const beforeSolve = buildNumericalTaskChecks({
    geometryTouched: true,
    loadingPatchTouched: true,
    meshTargetReached: true,
    solvedAtTargetCells: false,
    solvedAtTargetYoung: false,
  });

  const afterSolve = buildNumericalTaskChecks({
    geometryTouched: true,
    loadingPatchTouched: true,
    meshTargetReached: true,
    solvedAtTargetCells: true,
    solvedAtTargetYoung: false,
  });

  assert.equal(
    beforeSolve.find((task) => task.id === "set-mesh-density")?.complete,
    false,
  );
  assert.equal(
    afterSolve.find((task) => task.id === "set-mesh-density")?.complete,
    true,
  );
});

test("numerical task sequence does not include a separate baseline run task", () => {
  const checks = buildNumericalTaskChecks({
    geometryTouched: false,
    loadingPatchTouched: false,
    meshTargetReached: false,
    solvedAtTargetCells: false,
    solvedAtTargetYoung: false,
  });

  assert.deepEqual(
    checks.map((task) => task.id),
    [
      "define-geometry",
      "define-loading-patch",
      "set-mesh-density",
      "change-young-run-result",
    ],
  );
});
