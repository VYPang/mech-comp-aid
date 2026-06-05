import assert from "node:assert/strict";
import test from "node:test";

import { buildDisplacementErrorGrid } from "./plots.js";

test("buildDisplacementErrorGrid computes pointwise displacement error magnitude", () => {
  const referenceGrid = {
    x: [0, 1],
    y: [0, 1],
    u: [[0, 1], [2, null]],
    v: [[0, 2], [1, null]],
  };
  const candidateGrid = {
    x: [0, 1],
    y: [0, 1],
    u: [[0, 4], [2, null]],
    v: [[0, 6], [5, null]],
  };

  const errorGrid = buildDisplacementErrorGrid(referenceGrid, candidateGrid);

  assert.deepEqual(errorGrid.x, [0, 1]);
  assert.deepEqual(errorGrid.y, [0, 1]);
  assert.equal(errorGrid.z[0][0], 0);
  assert.equal(errorGrid.z[0][1], 5);
  assert.equal(errorGrid.z[1][0], 4);
  assert.equal(errorGrid.z[1][1], null);
});

test("buildDisplacementErrorGrid rejects mismatched displacement grids", () => {
  const errorGrid = buildDisplacementErrorGrid(
    { x: [0], y: [0], u: [[0]], v: [[0]] },
    { x: [0, 1], y: [0], u: [[0, 1]], v: [[0, 1]] },
  );

  assert.equal(errorGrid, null);
});