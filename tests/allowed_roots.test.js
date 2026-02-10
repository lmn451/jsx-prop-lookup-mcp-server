import { test, describe } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.resolve(__dirname, '../src/index.ts');
const repoRoot = path.resolve(__dirname, '..');
const examplesDir = path.resolve(__dirname, '../examples/sample-components');

function createMCPClient(env = {}) {
  const envCopy = { ...process.env, ...env };
  const server = spawn('node', ['--import=tsx', serverPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: envCopy,
  });

  let responseBuffer = '';
  let pendingRequests = new Map();
  let requestId = 1;

  server.stdout.on('data', (data) => {
    responseBuffer += data.toString();
    const lines = responseBuffer.split('\n');
    responseBuffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const response = JSON.parse(line);
        if (response.id && pendingRequests.has(response.id)) {
          const resolve = pendingRequests.get(response.id);
          pendingRequests.delete(response.id);
          resolve(response);
        }
      } catch (e) {
        // ignore non-json lines
      }
    }
  });

  const sendRequest = (method, params = {}) => {
    return new Promise((resolve, reject) => {
      const id = requestId++;
      const request = { jsonrpc: '2.0', id, method, params };
      pendingRequests.set(id, resolve);
      server.stdin.write(JSON.stringify(request) + '\n');
      setTimeout(() => {
        if (pendingRequests.has(id)) {
          pendingRequests.delete(id);
          reject(new Error(`Request ${method} timed out`));
        }
      }, 10000);
    });
  };

  const close = () => server.kill();

  return { sendRequest, close };
}

describe('ALLOWED_ROOTS enforcement', () => {
  test('allows requests within ALLOWED_ROOTS', async () => {
    const client = createMCPClient({ ALLOWED_ROOTS: examplesDir });
    try {
      await client.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      });

      const response = await client.sendRequest('tools/call', {
        name: 'analyze_jsx_props',
        arguments: { path: examplesDir },
      });

      assert.ok(response.result, 'Should have result');
      assert.strictEqual(response.result.isError, undefined, 'Should not be marked as error');
      const content = response.result.content[0].text;
      const parsed = JSON.parse(content);
      assert.ok(parsed.summary, 'Should return summary');
    } finally {
      client.close();
    }
  });

  test('rejects requests outside ALLOWED_ROOTS', async () => {
    const client = createMCPClient({ ALLOWED_ROOTS: examplesDir });
    try {
      await client.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      });

      const response = await client.sendRequest('tools/call', {
        name: 'analyze_jsx_props',
        arguments: { path: repoRoot },
      });

      assert.ok(response.result, 'Should have result');
      assert.strictEqual(response.result.isError, true, 'Should be marked as error');
      const text = response.result.content[0].text;
      assert.ok(
        text.includes('outside allowed roots') ||
          text.includes('Access to path outside allowed roots'),
        'Should mention allowed roots'
      );
    } finally {
      client.close();
    }
  });

  test('rejects symlink that resolves outside ALLOWED_ROOTS', async () => {
    // Create a symlink inside examplesDir that points to repoRoot (outside allowed)
    const linkDir = path.join(examplesDir, 'tmp-symlink-dir');
    const linkPath = path.join(linkDir, 'link-to-repo-root');
    try {
      fs.mkdirSync(linkDir, { recursive: true });
      try {
        if (fs.existsSync(linkPath)) fs.unlinkSync(linkPath);
        fs.symlinkSync(repoRoot, linkPath, 'dir');
      } catch (e) {
        // If symlink creation isn't permitted on the platform, skip this subtest
        test.skip('symlink not supported on this platform');
        return;
      }

      const client = createMCPClient({ ALLOWED_ROOTS: examplesDir });
      try {
        await client.sendRequest('initialize', {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '1.0.0' },
        });

        const response = await client.sendRequest('tools/call', {
          name: 'analyze_jsx_props',
          arguments: { path: linkPath },
        });

        assert.ok(response.result, 'Should have result');
        assert.strictEqual(response.result.isError, true, 'Should be marked as error');
        const text = response.result.content[0].text;
        assert.ok(
          text.includes('outside allowed roots') ||
            text.includes('Access to path outside allowed roots'),
          'Should mention allowed roots'
        );
      } finally {
        client.close();
      }
    } finally {
      try {
        fs.unlinkSync(linkPath);
      } catch (_) {}
      try {
        fs.rmdirSync(linkDir);
      } catch (_) {}
    }
  });
});
