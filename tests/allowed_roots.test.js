import { test, describe } from 'node:test';
import assert from 'node:assert';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import path from 'node:path';
import fs from 'fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.resolve(__dirname, '../src/index.ts');
const repoRoot = path.resolve(__dirname, '..');
const examplesDir = path.resolve(__dirname, '../examples/sample-components');

function createMCPClient(env = {}) {
  const client = new Client(
    { name: 'jsx-prop-lookup-security-test-client', version: '2.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } }
  );
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['--import=tsx', serverPath],
    cwd: repoRoot,
    env: { ...process.env, ...env },
  });

  return { client, transport };
}

async function withMCPClient(env, callback) {
  const { client, transport } = createMCPClient(env);
  try {
    await client.connect(transport);
    return await callback(client);
  } finally {
    await client.close();
  }
}

describe('ALLOWED_ROOTS enforcement', () => {
  test('allows requests within ALLOWED_ROOTS', async () => {
    await withMCPClient({ ALLOWED_ROOTS: examplesDir }, async (client) => {
      const result = await client.callTool({
        name: 'analyze_jsx_props',
        arguments: { path: examplesDir },
      });

      assert.strictEqual(result.isError, undefined, 'Should not be marked as error');
      const parsed = JSON.parse(result.content[0].text);
      assert.ok(parsed.summary, 'Should return summary');
    });
  });

  test('rejects requests outside ALLOWED_ROOTS', async () => {
    await withMCPClient({ ALLOWED_ROOTS: examplesDir }, async (client) => {
      const result = await client.callTool({
        name: 'analyze_jsx_props',
        arguments: { path: repoRoot },
      });

      assert.strictEqual(result.isError, true, 'Should be marked as error');
      const text = result.content[0].text;
      assert.ok(
        text.includes('outside allowed roots') ||
          text.includes('Access to path outside allowed roots'),
        'Should mention allowed roots'
      );
    });
  });

  test('rejects symlink that resolves outside ALLOWED_ROOTS', async () => {
    const allowedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-prop-lookup-'));
    const linkPath = path.join(allowedRoot, 'link-to-repo-root');
    try {
      try {
        fs.symlinkSync(repoRoot, linkPath, 'dir');
      } catch {
        test.skip('symlink not supported on this platform');
        return;
      }

      await withMCPClient({ ALLOWED_ROOTS: allowedRoot }, async (client) => {
        const result = await client.callTool({
          name: 'analyze_jsx_props',
          arguments: { path: linkPath },
        });

        assert.strictEqual(result.isError, true, 'Should be marked as error');
        const text = result.content[0].text;
        assert.ok(
          text.includes('outside allowed roots') ||
            text.includes('Access to path outside allowed roots'),
          'Should mention allowed roots'
        );
      });
    } finally {
      fs.rmSync(allowedRoot, { recursive: true, force: true });
    }
  });
});
