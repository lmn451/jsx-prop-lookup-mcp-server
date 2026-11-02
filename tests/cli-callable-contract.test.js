import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const executable = fileURLToPath(new URL('../dist/index.js', import.meta.url));

for (const [contract, declaration] of [
  ['function type alias', 'type Render = (props: { title: string }) => unknown;'],
  ['interface call signature', 'interface Render { (props: { title: string }): unknown; }'],
]) {
  test(`CLI inspection preserves the ${contract} contract when the implementation has no parameter`, (t) => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-cli-callable-')));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const sourceFile = path.join(root, 'Widget.tsx');
    const source = Buffer.from(`${declaration}\nexport const Widget: Render = () => null;\n`);
    fs.writeFileSync(sourceFile, source);
    const env = { ...process.env };
    delete env.PROJECT_ROOT;
    delete env.ALLOWED_ROOTS;
    const output = spawnSync(
      process.execPath,
      [executable, 'inspect', '--component', 'Widget', '--json'],
      { cwd: root, env, encoding: 'utf8', input: '', timeout: 15_000 }
    );

    assert.equal(output.error, undefined);
    assert.equal(output.signal, null);
    assert.deepEqual(fs.readFileSync(sourceFile), source);
    assert.equal(output.status, 0, output.stderr);
    assert.equal(output.stderr, '');
    const result = JSON.parse(output.stdout);
    assert.equal(result.complete, true);
    assert.deepEqual(result.unresolved, []);
    assert.equal(result.total, 1);
    assert.deepEqual(
      result.matches.map(({ name, props }) => ({ name, props })),
      [{ name: 'Widget', props: [{ name: 'title', type: 'string', required: true }] }]
    );
  });
}
