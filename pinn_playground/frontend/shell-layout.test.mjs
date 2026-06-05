import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const indexHtml = readFileSync(join(here, "index.html"), "utf8");

test("desktop shell exposes a collapsible learning rail and active task strip", () => {
  assert.doesNotMatch(indexHtml, /id="learning-path-toggle"/);
  assert.match(indexHtml, /id="active-task-panel"/);
  assert.doesNotMatch(indexHtml, /id="utility-panel"/);
  assert.doesNotMatch(indexHtml, /id="next-step-button"/);
  assert.match(indexHtml, /id="reset-progress-button"/);
  assert.doesNotMatch(indexHtml, /id="workspace-title"/);
});
