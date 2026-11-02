import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const serverPath = fileURLToPath(new URL('../dist/index.js', import.meta.url));

for (const configuration of ['environment', 'option', 'option-overrides-environment']) {
  test(`MCP queries use the configured project root: ${configuration}`, async (t) => {
    const parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-project-mcp-')));
    const root = path.join(parent, 'root');
    fs.mkdirSync(root);
    fs.writeFileSync(
      path.join(root, 'Widget.tsx'),
      'function Widget({title}) { return <span>{title}</span>; } const view = <Widget title="inside" />;'
    );
    fs.writeFileSync(path.join(root, 'Hidden.tsx'), 'const hidden = <Widget title="hidden" />;');
    fs.writeFileSync(path.join(root, '.gitignore'), 'Hidden.tsx');
    const client = new Client(
      { name: 'project-setup-tests', version: '1.0.0' },
      { versionNegotiation: { mode: { pin: '2026-07-28' } } }
    );
    t.after(async () => {
      await client.close();
      fs.rmSync(parent, { recursive: true, force: true });
    });
    const args = configuration === 'environment' ? [] : ['--project-root', root];
    const env = {
      ...process.env,
      ALLOWED_ROOTS: parent,
      PROJECT_ROOT:
        configuration === 'option-overrides-environment' ? path.join(parent, 'missing') : root,
    };
    if (configuration === 'option') delete env.PROJECT_ROOT;
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [serverPath, '--legacy-tools', ...args],
        cwd: parent,
        env,
      })
    );
    for (const request of [
      { name: 'analyze_jsx_props', arguments: {} },
      { name: 'find_prop_usage', arguments: { propName: 'title' } },
      { name: 'get_component_props', arguments: { componentName: 'Widget' } },
      {
        name: 'find_components_without_prop',
        arguments: { componentName: 'Widget', requiredProp: 'disabled' },
      },
    ]) {
      const result = await client.callTool(request);
      assert.equal(result.isError, undefined, result.content[0].text);
      const parsed = JSON.parse(result.content[0].text);
      assert.ok(JSON.stringify(parsed).includes('Widget.tsx'));
      assert.equal(JSON.stringify(parsed).includes('Hidden.tsx'), false);
    }
    const denied = await client.callTool({ name: 'analyze_jsx_props', arguments: { path: '..' } });
    assert.equal(denied.isError, true);
    assert.match(denied.content[0].text, /outside project root/);
  });
}
