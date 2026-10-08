import { test, describe } from 'node:test';
import assert from 'node:assert';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import path from 'node:path';
import fs from 'fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.resolve(__dirname, '../dist/index.js');
const repoRoot = path.resolve(__dirname, '..');
const examplesDir = path.resolve(__dirname, '../examples/sample-components');

function createMCPClient(env = {}, args = []) {
  const client = new Client(
    { name: 'jsx-prop-lookup-security-test-client', version: '2.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } }
  );
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath, '--legacy-tools', ...args],
    cwd: repoRoot,
    env: { ...process.env, ...env },
  });

  return { client, transport };
}

async function withMCPClient(env, callback, args = []) {
  const { client, transport } = createMCPClient(env, args);
  try {
    await client.connect(transport);
    return await callback(client);
  } finally {
    await client.close();
  }
}

describe('ALLOWED_ROOTS enforcement', () => {
  test('supports multiple trimmed roots while rejecting prefix siblings and parent traversal', async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-multiple-roots-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const roots = ['allowed', 'second', 'allowed-extra'].map((name) => path.join(directory, name));
    for (const root of roots) {
      fs.mkdirSync(root);
      fs.writeFileSync(path.join(root, 'Example.tsx'), 'const view = <Button title="ok" />;');
    }
    await withMCPClient({ ALLOWED_ROOTS: ` ${roots[0]},, ${roots[1]} ` }, async (client) => {
      for (const root of roots.slice(0, 2)) {
        const result = await client.callTool({
          name: 'analyze_jsx_props',
          arguments: { path: root },
        });
        assert.equal(result.isError, undefined);
        assert.equal(JSON.parse(result.content[0].text).summary.totalFiles, 1);
      }
      for (const denied of [roots[2], `${roots[0]}/../allowed-extra`]) {
        const result = await client.callTool({
          name: 'analyze_jsx_props',
          arguments: { path: denied },
        });
        assert.equal(result.isError, true);
        assert.match(result.content[0].text, /outside allowed roots/);
      }
    });
  });

  test('resolves relative allowed roots from the server working directory', async () => {
    await withMCPClient({ ALLOWED_ROOTS: 'examples/sample-components' }, async (client) => {
      const result = await client.callTool({
        name: 'find_prop_usage',
        arguments: { directory: examplesDir, propName: 'onClick' },
      });
      assert.equal(result.isError, undefined);
      assert.ok(JSON.parse(result.content[0].text).length > 0);
    });
  });

  test('accepts an allowed root that is itself a directory symlink', async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-symlink-root-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const target = path.join(directory, 'target');
    const link = path.join(directory, 'link');
    fs.mkdirSync(target);
    fs.writeFileSync(path.join(target, 'Example.tsx'), 'const view = <Button title="ok" />;');
    fs.symlinkSync(target, link, 'dir');
    await withMCPClient({ ALLOWED_ROOTS: link }, async (client) => {
      const result = await client.callTool({
        name: 'analyze_jsx_props',
        arguments: { path: target },
      });
      assert.equal(result.isError, undefined);
      assert.equal(JSON.parse(result.content[0].text).propUsages[0].value, 'ok');
    });
  });

  test('rejects outside symlink targets discovered by all four directory tools', async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-roots-scan-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const allowed = path.join(directory, 'allowed');
    fs.mkdirSync(allowed);
    const outside = path.join(directory, 'Outside.tsx');
    fs.writeFileSync(outside, 'const Outside = () => <Widget token="outside-value" />;');
    fs.symlinkSync(outside, path.join(allowed, 'linked.tsx'));
    await withMCPClient({ ALLOWED_ROOTS: allowed }, async (client) => {
      const requests = [
        { name: 'analyze_jsx_props', arguments: { path: allowed } },
        { name: 'find_prop_usage', arguments: { directory: allowed, propName: 'token' } },
        {
          name: 'get_component_props',
          arguments: { directory: allowed, componentName: 'Outside' },
        },
        {
          name: 'find_components_without_prop',
          arguments: {
            directory: allowed,
            componentName: 'Widget',
            requiredProp: 'width',
          },
        },
      ];
      for (const request of requests) {
        const result = await client.callTool(request);
        assert.equal(result.isError, true, request.name);
        assert.match(result.content[0].text, /outside allowed roots/);
        assert.ok(!result.content[0].text.includes('outside-value'));
      }
    });
  });

  test('treats glob characters in the requested directory literally', async (t) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-roots-glob-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const allowed = path.join(directory, 'project[1]');
    const sibling = path.join(directory, 'project1');
    fs.mkdirSync(allowed);
    fs.mkdirSync(sibling);
    fs.writeFileSync(path.join(allowed, 'Good.tsx'), 'const view = <Button marker="allowed" />;');
    fs.writeFileSync(path.join(sibling, 'Bad.tsx'), 'const view = <Button marker="outside" />;');
    await withMCPClient({ ALLOWED_ROOTS: allowed }, async (client) => {
      const result = await client.callTool({
        name: 'find_prop_usage',
        arguments: { directory: allowed, propName: 'marker' },
      });
      assert.equal(result.isError, undefined);
      const usages = JSON.parse(result.content[0].text);
      assert.equal(usages.length, 1);
      assert.equal(usages[0].value, 'allowed');
      assert.equal(usages[0].file, path.join(allowed, 'Good.tsx'));
    });
  });

  test('allows internal symlinks and literal names beginning with two dots', async (t) => {
    const allowed = fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-roots-internal-'));
    t.after(() => fs.rmSync(allowed, { recursive: true, force: true }));
    const source = path.join(allowed, '..local.tsx');
    const link = path.join(allowed, 'linked.tsx');
    fs.writeFileSync(source, 'const view = <Button marker="allowed" />;');
    fs.symlinkSync(source, link);
    await withMCPClient({ ALLOWED_ROOTS: allowed }, async (client) => {
      for (const file of [source, link]) {
        const result = await client.callTool({
          name: 'analyze_jsx_props',
          arguments: { path: file },
        });
        assert.equal(result.isError, undefined);
        assert.equal(JSON.parse(result.content[0].text).propUsages[0].value, 'allowed');
      }
    });
  });

  test('CLI roots take precedence over the environment', async () => {
    for (const args of [['--allowed-roots', examplesDir], [`--allowed-roots=${examplesDir}`]]) {
      await withMCPClient(
        { ALLOWED_ROOTS: '/nonexistent' },
        async (client) => {
          const result = await client.callTool({
            name: 'analyze_jsx_props',
            arguments: { path: examplesDir },
          });
          assert.equal(result.isError, undefined);
        },
        args
      );
    }
  });

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

  test('rejects symlink that resolves outside ALLOWED_ROOTS', async (t) => {
    const allowedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-prop-lookup-'));
    const linkPath = path.join(allowedRoot, 'link-to-repo-root');
    try {
      try {
        fs.symlinkSync(repoRoot, linkPath, 'dir');
      } catch {
        t.skip('symlink not supported on this platform');
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
