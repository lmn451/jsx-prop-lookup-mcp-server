import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { parseCommandLine, executeCommand, renderHumanResult } from '../dist/cli.js';
import { McpServer, InMemoryTransport } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { ProjectWorkspace } from '../dist/project.js';
import { registerInspectComponentTool } from '../dist/inspect-component.js';

const serverPath = fileURLToPath(new URL('../dist/index.js', import.meta.url));
function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-impact-boundary-')));
  const files = {
    'Button.tsx': 'export function Button(props: {label?: string}) { return null; }',
    'Good.tsx': 'import {Button as B} from "./Button"; const x = <B label="Save" />;',
    'Unknown.tsx': 'import {Button as B} from "./Button"; const x = <B {...props} />;',
  };
  for (const [name, value] of Object.entries(files)) fs.writeFileSync(path.join(root, name), value);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return {
    root,
    assertUnchanged() {
      for (const [name, value] of Object.entries(files))
        assert.equal(fs.readFileSync(path.join(root, name), 'utf8'), value);
    },
  };
}

// Impact is an inspection mode. The MCP surface remains exactly three tools.
test('MCP inspection exposes read-only prop-removal impact with validated input', async (t) => {
  const project = fixture(t);
  const client = new Client(
    { name: 'impact-boundary-tests', version: '1.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } }
  );
  t.after(() => client.close());
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [serverPath, 'serve', '--project-root', project.root],
      env: { ...process.env, ALLOWED_ROOTS: '', PROJECT_ROOT: '' },
      stderr: 'pipe',
    })
  );
  const listed = await client.listTools();
  assert.deepEqual(listed.tools.map((tool) => tool.name).sort(), [
    'check_jsx',
    'find_jsx',
    'inspect_component',
  ]);
  const response = await client.callTool({
    name: 'inspect_component',
    arguments: {
      component: 'Button',
      source: './Button',
      removeProp: 'label',
    },
  });
  assert.equal(response.isError, undefined);
  const result = JSON.parse(response.content[0].text);
  assert.equal(result.summary.action, 'remove-prop');
  assert.equal(result.summary.affected, 1);
  assert.equal(result.summary.unresolved, 1);
  assert.equal(result.matches[0].component, 'B');
  assert.equal(result.matches[0].prop, 'label');
  assert.equal(result.complete, false);
  const invalid = await client.callTool({
    name: 'inspect_component',
    arguments: {
      component: 'Button',
      removeProp: ' ',
    },
  });
  assert.equal(invalid.isError, true);
  project.assertUnchanged();
});

for (const [selection, code, complete] of [
  ['Good.tsx', 0, true],
  ['.', 2, false],
]) {
  test(`CLI inspection impact reports ${selection} with exit ${code}`, (t) => {
    const project = fixture(t);
    const child = spawnSync(
      process.execPath,
      [
        serverPath,
        'inspect',
        '--project-root',
        project.root,
        '--component',
        'Button',
        '--source',
        './Button',
        '--path',
        selection,
        '--remove-prop',
        'label',
        '--json',
      ],
      {
        encoding: 'utf8',
        timeout: 15_000,
        env: { ...process.env, ALLOWED_ROOTS: '', PROJECT_ROOT: '' },
      }
    );
    assert.equal(child.error, undefined);
    assert.equal(child.stderr, '');
    assert.equal(child.status, code);
    const result = JSON.parse(child.stdout);
    assert.equal(result.summary.action, 'remove-prop');
    assert.equal(result.summary.affected, 1);
    assert.equal(result.complete, complete);
    assert.equal(result.matches[0].prop, 'label');
    project.assertUnchanged();
  });
}

test('shared CLI execution renders prop-removal locations and retains the overall total', async (t) => {
  const project = fixture(t);
  const args = [
    'inspect',
    '--project-root',
    project.root,
    '--component',
    'Button',
    '--path',
    'Good.tsx',
    '--remove-prop',
    'label',
  ];
  const command = parseCommandLine(args, {});
  const { result, exitCode } = await executeCommand(command);
  assert.equal(exitCode, 0);
  assert.equal(result.summary.affected, 1);
  assert.match(renderHumanResult(result), /Good\.tsx:1:\d+ B: remove prop label/);
  const { result: page, exitCode: pageCode } = await executeCommand(
    parseCommandLine([...args, '--offset', '1'], {})
  );
  assert.equal(pageCode, 0);
  assert.deepEqual(page.matches, []);
  assert.equal(page.summary.affected, 1);
  assert.equal(renderHumanResult(page), 'No matches on this page (1 total).');
  project.assertUnchanged();
});

for (const command of ['query', 'check', 'serve']) {
  test(`prop removal is not accepted by ${command}`, () => {
    assert.throws(() => parseCommandLine([command, '--remove-prop', 'label'], {}), /not supported/);
  });
}

for (const prop of ['', ' ']) {
  test(`shared CLI rejects a ${prop ? 'whitespace' : 'empty'} removal name`, async (t) => {
    const project = fixture(t);
    const command = parseCommandLine(
      ['inspect', '--project-root', project.root, '--component', 'Button', '--remove-prop', prop],
      {}
    );
    await assert.rejects(executeCommand(command));
    project.assertUnchanged();
  });
}

test('MCP inspection advertises and executes the optional removal mode', async (t) => {
  const project = fixture(t);
  const server = new McpServer({ name: 'impact-schema', version: '1.0.0' });
  registerInspectComponentTool(server, new ProjectWorkspace({ root: project.root }));
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const handle = serveStdio(() => server, { transport: serverTransport, legacy: 'reject' });
  const client = new Client(
    { name: 'impact-schema-tests', version: '1.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } }
  );
  t.after(async () => {
    await client.close();
    await handle.close();
  });
  await client.connect(clientTransport);
  const tool = (await client.listTools()).tools[0];
  assert.match(tool.description, /removeProp/);
  assert.match(tool.inputSchema.properties.removeProp.description, /removing this prop/);
  const response = await client.callTool({
    name: 'inspect_component',
    arguments: { component: 'Button', path: 'Good.tsx', removeProp: ' label ' },
  });
  assert.equal(response.isError, undefined);
  assert.equal(response.structuredContent.summary.affected, 1);
  assert.equal(response.structuredContent.summary.prop, 'label');
  assert.deepEqual(response.structuredContent, JSON.parse(response.content[0].text));
  const regular = await client.callTool({
    name: 'inspect_component',
    arguments: { component: 'Button' },
  });
  assert.equal(regular.isError, undefined);
  assert.equal(regular.structuredContent.matches[0].props[0].name, 'label');
  const invalid = await client.callTool({
    name: 'inspect_component',
    arguments: { component: 'Button', removeProp: '' },
  });
  assert.equal(invalid.isError, true);
  project.assertUnchanged();
});
