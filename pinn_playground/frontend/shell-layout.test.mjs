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
  assert.match(indexHtml, /id="utility-panel"/);
  assert.match(indexHtml, /<aside id="learning-path-aside"[\s\S]*id="utility-panel"/);
  assert.doesNotMatch(indexHtml, /id="workspace-title"/);
});
