import assert from "node:assert/strict";
import test from "node:test";

import { PINN_COMPARE_VIEWS, resolvePinnCompareView } from "./pinn-compare-views.js";

test("PINN comparison exposes stress and deformation views", () => {
  assert.deepEqual(
    PINN_COMPARE_VIEWS.map((view) => [view.id, view.label]),
    [
      ["stress", "Stress"],
      ["deformation", "Deformation"],
    ],
  );
});

test("resolvePinnCompareView falls back to stress", () => {
  assert.equal(resolvePinnCompareView("deformation").id, "deformation");
  assert.equal(resolvePinnCompareView("unknown").id, "stress");
  assert.equal(resolvePinnCompareView(null).id, "stress");
});
