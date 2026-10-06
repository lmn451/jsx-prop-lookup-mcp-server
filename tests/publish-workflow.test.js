import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import YAML from "yaml";

const root = fileURLToPath(new URL("..", import.meta.url));
const validator = `${root}/.github/scripts/validate-version.cjs`;

function validateVersion(version) {
  return spawnSync(process.execPath, [validator], {
    encoding: "utf8",
    env: { ...process.env, VERSION_OVERRIDE: version },
  });
}

test("manual release version validation accepts and normalizes npm semver", () => {
  for (const [input, normalized] of [
    ["4.0.0", "4.0.0"],
    ["4.0.0+build.7", "4.0.0"],
    ["4.0.0-beta.1+build.7", "4.0.0-beta.1"],
    ["v4.0.0", "4.0.0"],
  ]) {
    const result = validateVersion(input);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, normalized);
  }
});

test("manual release version validation rejects malformed and shell input", () => {
  for (const input of [
    "not-a-version",
    "4.0.0\nhas_changes=true",
    "$(touch /tmp/nope)",
    "4.0.0; touch /tmp/nope",
  ]) {
    const result = validateVersion(input);
    assert.notEqual(result.status, 0, JSON.stringify(input));
    assert.equal(result.stdout, "");
  }
});

test("publish workflow parses with unique keys and one complete auth environment", () => {
  const source = readFileSync(`${root}/.github/workflows/publish.yml`, "utf8");
  const document = YAML.parseDocument(source, { uniqueKeys: true });
  assert.deepEqual(document.errors, []);
  const workflow = document.toJS();
  const publishStep = workflow.jobs.publish.steps.find((step) => step.id === "npm_publish");

  assert.ok(publishStep);
  assert.deepEqual(Object.keys(publishStep.env).sort(), ["NEW_VERSION", "NODE_AUTH_TOKEN"]);
  assert.equal(publishStep.env.NODE_AUTH_TOKEN, "${{ secrets.NPM_TOKEN }}");
});
