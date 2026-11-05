import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import process from 'node:process';

// Execute the actual archive with an isolated production dependency installation.
// This catches missing compiled files and accidental development-only imports.
test('packed executable queries a project and starts MCP with runtime dependencies only', async (t) => {
  const repository = fileURLToPath(new URL('..', import.meta.url));
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-package-runtime-'));
  const client = new Client(
    { name: 'package-runtime-test', version: '1.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } }
  );
  t.after(async () => {
    await client.close();
    fs.rmSync(temporary, { recursive: true, force: true });
  });
  const env = { ...process.env, ALLOWED_ROOTS: '', PROJECT_ROOT: '' };
  delete env.NODE_OPTIONS;
  delete env.NODE_PATH;
  const report = JSON.parse(
    execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', temporary], {
      cwd: repository,
      encoding: 'utf8',
      timeout: 60_000,
      env,
    })
  );
  const entry = Array.isArray(report) ? report[0] : Object.values(report)[0];
  assert.ok(entry.filename);
  execFileSync('tar', ['-xzf', path.join(temporary, entry.filename), '-C', temporary], {
    timeout: 60_000,
  });
  const packed = path.join(temporary, 'package');
  const manifest = JSON.parse(fs.readFileSync(path.join(packed, 'package.json'), 'utf8'));
  fs.copyFileSync(
    path.join(repository, 'package-lock.json'),
    path.join(packed, 'package-lock.json')
  );
  execFileSync(
    'npm',
    ['ci', '--omit=dev', '--ignore-scripts', '--prefer-offline', '--no-audit', '--no-fund'],
    {
      cwd: packed,
      encoding: 'utf8',
      timeout: 60_000,
      env,
    }
  );
  const project = path.join(temporary, 'project');
  fs.mkdirSync(project);
  fs.writeFileSync(
    path.join(project, 'Button.tsx'),
    'export const Button = (props: {label: string}) => null;'
  );
  fs.writeFileSync(
    path.join(project, 'App.tsx'),
    'import {Button as Action} from "./Button"; const view = <Action label="Save" />;'
  );
  const executable = path.join(packed, manifest.bin['jsx-prop-lookup-mcp-server']);
  const options = {
    cwd: temporary,
    encoding: 'utf8',
    timeout: 15_000,
    env,
  };
  const query = spawnSync(
    process.execPath,
    [
      executable,
      'query',
      '--project-root',
      project,
      '--component',
      'Button',
      '--source',
      './Button',
      '--json',
    ],
    options
  );
  assert.equal(query.error, undefined);
  assert.equal(query.status, 0, query.stderr);
  const result = JSON.parse(query.stdout);
  assert.equal(result.complete, true);
  assert.equal(result.total, 1);
  assert.equal(result.matches[0].component, 'Action');
  assert.deepEqual(result.matches[0].props.label, { status: 'known', value: 'Save' });
  assert.equal(query.stderr, '');
  assert.ok(fs.existsSync(path.join(packed, 'dist/swc-discovery.js')));
  assert.equal(manifest.optionalDependencies['@swc-next/core'], '0.5.0');
  const swcArgs = [
    executable,
    'query',
    '--project-root',
    project,
    '--component',
    'Button',
    '--source',
    './Button',
    '--json',
    '--discovery',
    'swc',
  ];
  const swc = spawnSync(process.execPath, swcArgs, options);
  assert.equal(swc.status, 0, swc.stderr);
  assert.deepEqual(JSON.parse(swc.stdout), result);
  const optional = path.join(packed, 'node_modules', '@swc-next', 'core');
  const disabled = optional + '-disabled';
  fs.renameSync(optional, disabled);
  try {
    const defaultOnly = spawnSync(
      process.execPath,
      [executable, 'query', '--project-root', project, '--json'],
      options
    );
    assert.equal(defaultOnly.status, 0, defaultOnly.stderr);
    const inspection = spawnSync(
      process.execPath,
      [executable, 'inspect', '--project-root', project, '--component', 'Button', '--json'],
      options
    );
    assert.equal(inspection.status, 0, inspection.stderr);
    assert.equal(JSON.parse(inspection.stdout).matches[0].name, 'Button');
    const defaultServer = spawnSync(process.execPath, [executable, '--project-root', project], {
      ...options,
      input: '',
    });
    assert.equal(defaultServer.status, 0, defaultServer.stderr);
    const unavailable = spawnSync(process.execPath, swcArgs, options);
    assert.equal(unavailable.status, 2);
    assert.match(JSON.parse(unavailable.stdout).error.message, /optional @swc-next\/core/);
  } finally {
    fs.renameSync(disabled, optional);
  }
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [executable, '--project-root', project],
      cwd: temporary,
      env,
    }),
    { timeout: 15_000 }
  );
  const inventory = await client.listTools({}, { timeout: 15_000 });
  assert.deepEqual(inventory.tools.map((tool) => tool.name).sort(), [
    'check_jsx',
    'find_jsx',
    'inspect_component',
  ]);
  await client.close();
  const server = spawnSync(process.execPath, [executable, '--project-root', project], {
    ...options,
    input: '',
  });
  assert.equal(server.error, undefined);
  assert.equal(server.status, 0, server.stderr);
  assert.equal(server.stdout, '');
});
