import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const serverPath = fileURLToPath(new URL('../dist/index.js', import.meta.url));
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

// This exercises the startup version guard with controlled runtime metadata;
// actual support for each Node release is verified by the CI runtime matrix.
for (const [boundary, nodeVersion, expectedStatus, expectedStderr, expectedStdout] of [
  ['below the supported major', '19.9.0', 2, 'Error: Node.js 20 or higher is required\n', ''],
  ['at the supported major', '20.0.0', 0, '', `${version}\n`],
  ['above the supported major', '21.0.0', 0, '', `${version}\n`],
]) {
  test(`runtime version ${boundary} determines startup availability`, () => {
    const setup = `Object.defineProperty(process.versions, 'node', { value: ${JSON.stringify(nodeVersion)} });`;
    const result = spawnSync(
      process.execPath,
      ['--import', `data:text/javascript,${encodeURIComponent(setup)}`, serverPath, '--version'],
      { encoding: 'utf8', timeout: 5000 }
    );
    assert.equal(result.status, expectedStatus, result.stderr);
    assert.equal(result.stderr, expectedStderr);
    assert.equal(result.stdout, expectedStdout);
  });
}

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
    assert.equal(result.status, 2, `${args}: ${result.stderr}`);
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
    let ready = false;
    let signalSent = false;
    for await (const chunk of child.stderr) {
      stderr += chunk.toString();
      if (stderr.includes('running on stdio')) {
        ready = true;
        signalSent = child.kill(signal);
        break;
      }
    }
    const [code, exitSignal] = await closed;
    assert.equal(ready, true, `Server exited before it was ready: ${stderr}`);
    assert.equal(signalSent, true, `Could not send ${signal} to the running server`);
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

test('legacy protocol requests are rejected and diagnostics stay on stderr', () => {
  const request = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'legacy-protocol-test', version: '1.0.0' },
    },
  };
  const result = spawnSync(process.execPath, [serverPath], {
    input: JSON.stringify(request) + '\n',
    encoding: 'utf8',
    timeout: 5000,
  });
  assert.equal(result.status, 0, result.stderr);
  const response = JSON.parse(result.stdout);
  assert.equal(response.id, 1);
  assert.equal(response.error.code, -32022);
  assert.match(response.error.message, /Unsupported protocol version: 2025-11-25/);
  assert.deepEqual(response.error.data.supported, ['2026-07-28']);
  assert.match(result.stderr, /MCP server error:.*Rejected 2025-era request/);
});
