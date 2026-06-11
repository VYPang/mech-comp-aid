import test from "node:test";
import assert from "node:assert/strict";

import {
  getNumericalFigureConfig,
  NUMERICAL_TUTORIAL_INTRO,
  NUMERICAL_TUTORIAL_SECTIONS,
} from "./lessons/numerical-tutorial-content.js";

test("numerical tutorial provides eight ordered sections with figure slots", () => {
  assert.equal(NUMERICAL_TUTORIAL_SECTIONS.length, 8);
  assert.match(NUMERICAL_TUTORIAL_INTRO, /analytical mechanics/i);
  assert.match(NUMERICAL_TUTORIAL_INTRO, /FEM workspace/i);

  const ids = NUMERICAL_TUTORIAL_SECTIONS.map((section) => section.id);
  assert.deepEqual(ids, [
    "numerical-section-1",
    "numerical-section-2",
    "numerical-section-3",
    "numerical-section-4",
    "numerical-section-5",
    "numerical-section-6",
    "numerical-section-7",
    "numerical-section-8",
  ]);

  NUMERICAL_TUTORIAL_SECTIONS.forEach((section, index) => {
    assert.equal(typeof section.title, "string");
    assert.equal(typeof section.body, "string");
    assert.equal(typeof section.figureFactory, "function");
    if (index > 0) {
      assert.match(section.body, /Workspace connection|workspace/i);
    }
  });
});

test("chapter 1 uses the rewritten solid-mechanics refresher and axial bar figure", () => {
  const chapter = NUMERICAL_TUTORIAL_SECTIONS[0];
  const figure = getNumericalFigureConfig("mechanics");

  assert.match(chapter.body, /it is often easiest to start with stress/i);
  assert.match(chapter.body, /\\sigma = \\frac\{P\}\{A\}/);
  assert.match(chapter.body, /\\epsilon = \\frac\{\\delta\}\{L\}/);
  assert.match(chapter.body, /\\delta = \\frac\{PL\}\{AE\}/);

  assert.equal(figure.title, "Axial Point Load On A Fixed Cuboid (2D View)");
  assert.equal(figure.headline, "Figure 1 - Axial Point Load On A Fixed Cuboid (2D View)");
  assert.deepEqual(
    figure.controls.map((control) => control.id),
    ["load", "area", "young"],
  );
});
