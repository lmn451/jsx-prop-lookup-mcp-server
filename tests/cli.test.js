import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const serverPath = fileURLToPath(new URL('../dist/index.js', import.meta.url));
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

for (const flag of ['--help', '-h']) {
  test(`${flag} prints help without starting the server`, () => {
    const result = spawnSync(process.execPath, [serverPath, flag], {
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    assert.ok(result.stdout.includes(`v${version}`));
    assert.match(result.stdout, /--allowed-roots/);
    assert.match(result.stdout, /ALLOWED_ROOTS/);
    assert.match(result.stdout, /stdio/);
  });
}

test('rejects invalid CLI arguments before starting the server', () => {
  for (const args of [
    ['--allowed-roots'],
    ['--allowed-roots', '--help'],
    ['--unknown'],
    ['unexpected-positional'],
  ]) {
    const result = spawnSync(process.execPath, [serverPath, ...args], {
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.equal(result.status, 1, `${args}: ${result.stderr}`);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /^Error:/);
    assert.ok(!result.stderr.includes('running on stdio'));
  }
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  test(`${signal} shuts down the stdio server cleanly`, { timeout: 10000 }, async (t) => {
    const child = spawn(process.execPath, [serverPath], { stdio: ['pipe', 'pipe', 'pipe'] });
    t.after(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
    });
    const closed = once(child, 'close');
    let stderr = '';
    for await (const chunk of child.stderr) {
      stderr += chunk.toString();
      if (stderr.includes('running on stdio')) {
        child.kill(signal);
        break;
      }
    }
    const [code, exitSignal] = await closed;
    assert.equal(code, 0, stderr);
    assert.equal(exitSignal, null);
  });
}

test('closing stdin exits promptly without protocol output', () => {
  const result = spawnSync(process.execPath, [serverPath], {
    input: '',
    encoding: 'utf8',
    timeout: 5000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
});
