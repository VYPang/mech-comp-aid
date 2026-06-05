import assert from "node:assert/strict";
import test from "node:test";

import {
  FEM_SETUP_PREVIEW_MODES,
  PINN_SETUP_PREVIEW_MODES,
  resolveSetupPreviewMode,
} from "./setup-preview-modes.js";

test("FEM setup preview exposes mesh and boundary modes", () => {
  assert.deepEqual(
    FEM_SETUP_PREVIEW_MODES.map((mode) => [mode.id, mode.label]),
    [
      ["mesh", "Mesh"],
      ["boundary", "Boundary"],
    ],
  );
});

test("PINN setup preview exposes a collocation mode", () => {
  assert.deepEqual(
    PINN_SETUP_PREVIEW_MODES.map((mode) => [mode.id, mode.label]),
    [["collocation", "Collocation"]],
  );
});

test("resolveSetupPreviewMode falls back to the first mode", () => {
  assert.equal(resolveSetupPreviewMode(FEM_SETUP_PREVIEW_MODES, "boundary").id, "boundary");
  assert.equal(resolveSetupPreviewMode(FEM_SETUP_PREVIEW_MODES, "unknown").id, "mesh");
  assert.equal(resolveSetupPreviewMode([], "mesh"), null);
});
