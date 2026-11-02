import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { URL, fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { ProjectWorkspace } from '../dist/project.js';
import { findJsx } from '../dist/find-jsx.js';
import { collectJsx, createJsxSnapshot } from '../dist/jsx-query.js';
import { collectJsxWithSwc } from '../dist/swc-discovery.js';
import { parseCommandLine } from '../dist/cli.js';
import { createServer } from '../dist/server.js';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';

function fixture(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'swc-discovery-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [name, source] of Object.entries(files)) {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, source);
  }
  return new ProjectWorkspace({ root });
}

const ui =
  'export function Button(props: {label?: string; children?: unknown}) { return null; } export default Button;';
const cases = [
  [
    'aliases, barrels, namespaces and shadowing',
    `import Main, {Button as Alias} from './barrel'; import * as UI from './ui'; const a = <><Alias label="A" /><UI.Button /><Main /></>; function inner(Alias: unknown) { return <Alias />; }`,
  ],
  [
    'nested JSX and fragments',
    `import {Button} from './ui'; const x = <><Button icon={<Button label="nested" />}><Button /></Button></>;`,
  ],
  [
    'quoted keys, spreads and precedence',
    `import {Button} from './ui'; const x = <><Button {...{'aria-label': 'a', ['data-id']: 2}} {...rest} label="last" /><Button {...{...rest, label: 'known'}} /></>;`,
  ],
  [
    'static and dynamic expressions',
    `import {Button} from './ui'; const x = <Button a={-2} b={null} c={false} d={[1,'a']} e={{x: true}} f={fn()} g={undefined} h={value satisfies string} />;`,
  ],
  [
    'children and entities',
    `import {Button} from './ui'; const x = <><Button>first\n second</Button><Button> </Button><Button>{/* empty */}</Button><Button>&amp;</Button><Button label="&amp;" /></>;`,
  ],
  [
    'UTF-16 and CRLF locations',
    `import {Button} from './ui';\r\nconst emoji = '😀'; /* 😀 */ const x = <Button label="😀" />;\r\nconst y = <Button />;`,
  ],
  [
    'missing imports and dynamic tags',
    `import {Button} from './missing'; const x = <><Button {...rest} /><Local /><ns.Controls.Button /></>;`,
  ],
  ['no JSX', 'export const answer = 42;'],
];

for (const [label, source] of cases) {
  test(`SWC discovery preserves the full TypeScript result: ${label}`, async (t) => {
    const project = fixture(t, {
      'ui.tsx': ui,
      'barrel.ts': "export {Button, default} from './ui';",
      'app.tsx': source,
    });
    const snapshot = await createJsxSnapshot(project);
    const swc = collectJsxWithSwc(snapshot);
    assert.deepEqual(swc.fallbackFiles, []);
    assert.deepEqual({ matches: swc.matches, unresolved: swc.unresolved }, collectJsx(snapshot));
    for (const query of [
      {},
      { component: 'Button' },
      { component: 'Button', source: './ui' },
      { prop: 'label' },
      { prop: 'label', value: 'last' },
      { offset: 1, limit: 1 },
    ]) {
      assert.deepEqual(
        await findJsx(project, { ...query, discovery: 'swc' }),
        await findJsx(project, query)
      );
    }
  });
}

for (const [extension, source] of [
  ['js', 'const x = <Button />;'],
  ['jsx', 'const x = <Button />;'],
  ['tsx', 'const x = <Button />;'],
  ['ts', 'export const value: number = 1;'],
  ['d.ts', 'export declare const value: number;'],
]) {
  test(`SWC uses the correct syntax mode for .${extension}`, async (t) => {
    const project = fixture(t, { [`app.${extension}`]: source });
    const snapshot = await createJsxSnapshot(project);
    const result = collectJsxWithSwc(snapshot);
    assert.deepEqual(result.fallbackFiles, []);
    assert.deepEqual(result.matches, collectJsx(snapshot).matches);
  });
}

for (const source of [
  'const x = <Button label={;',
  'const duplicate = 1; const duplicate = 2; const view = <Button />;',
]) {
  test(`SWC recovery retains TypeScript diagnostics and results: ${source}`, async (t) => {
    const project = fixture(t, { 'app.tsx': source });
    const snapshot = await createJsxSnapshot(project);
    const result = collectJsxWithSwc(snapshot);
    assert.equal(result.fallbackFiles.length, 1);
    assert.deepEqual(
      { matches: result.matches, unresolved: result.unresolved },
      collectJsx(snapshot)
    );
    assert.deepEqual(await findJsx(project, { discovery: 'swc' }), await findJsx(project));
  });
}

test('SWC discovery preserves tsconfig paths and refreshed source reads', async (t) => {
  const project = fixture(t, {
    'tsconfig.json': JSON.stringify({
      compilerOptions: { baseUrl: '.', paths: { '@ui': ['./ui'] } },
    }),
    'ui.tsx': ui,
    'app.tsx': "import {Button as B} from '@ui'; const view = <B label='old' />;",
  });
  const query = { discovery: 'swc', component: 'Button', source: './ui' };
  assert.deepEqual(
    await findJsx(project, query),
    await findJsx(project, { ...query, discovery: 'typescript' })
  );
  fs.writeFileSync(
    path.join(project.root, 'app.tsx'),
    "import {Button as B} from '@ui'; const view = <B label='new' />;"
  );
  assert.equal((await findJsx(project, query)).matches[0].props.label.value, 'new');
});

test('SWC discovery keeps workspace containment and ignore rules', async (t) => {
  const project = fixture(t, {
    'app.tsx': '<Button />;',
    '.gitignore': 'ignored.tsx\n',
    'ignored.tsx': '<Hidden />;',
  });
  assert.equal((await findJsx(project, { discovery: 'swc' })).total, 1);
  await assert.rejects(
    findJsx(project, { path: '..', discovery: 'swc' }),
    /outside|escape|project/i
  );
});

test('discovery is explicit, validated, and query-only in the CLI', () => {
  assert.equal(parseCommandLine(['query', '--discovery', 'swc'], {}).query.discovery, 'swc');
  assert.equal(parseCommandLine(['query'], {}).query.discovery, undefined);
  assert.throws(() => parseCommandLine(['query', '--discovery', 'invalid'], {}), /discovery/);
  assert.throws(
    () => parseCommandLine(['inspect', '--component', 'Button', '--discovery', 'swc'], {}),
    /not supported/
  );
  assert.throws(
    () => parseCommandLine(['check', '--rules', 'rules.json', '--discovery', 'swc'], {}),
    /not supported/
  );
});

test('API rejects an invalid discovery backend', async (t) => {
  const project = fixture(t, { 'app.tsx': '<Button />;' });
  await assert.rejects(findJsx(project, { discovery: 'invalid' }), /discovery/);
});

test('CLI executes SWC discovery with identical JSON and exit code', async (t) => {
  const project = fixture(t, { 'app.tsx': '<Button title="ready" />;' });
  const cli = fileURLToPath(new URL('../dist/index.js', import.meta.url));
  const args = [cli, 'query', '--project-root', project.root, '--json'];
  const baseline = spawnSync(process.execPath, args, { encoding: 'utf8', timeout: 15000 });
  const swc = spawnSync(process.execPath, [...args, '--discovery', 'swc'], {
    encoding: 'utf8',
    timeout: 15000,
  });
  assert.equal(swc.status, baseline.status, swc.stderr);
  assert.deepEqual(JSON.parse(swc.stdout), JSON.parse(baseline.stdout));
});

test('MCP exposes SWC discovery only on find_jsx and preserves structured output', async (t) => {
  const project = fixture(t, { 'app.tsx': '<Button title="ready" />;' });
  const server = createServer({ root: project.root });
  const client = new Client({ name: 'swc-test', version: '1.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  t.after(async () => {
    await client.close();
    await server.close();
  });
  await server.connect(b);
  await client.connect(a);
  const { tools } = await client.listTools();
  assert.equal(tools.length, 3);
  for (const tool of tools.filter((tool) => tool.name !== 'find_jsx')) {
    assert.equal(tool.inputSchema.properties.discovery, undefined);
  }
  assert.ok(tools.find((tool) => tool.name === 'find_jsx').inputSchema.properties.discovery);
  const response = await client.callTool({ name: 'find_jsx', arguments: { discovery: 'swc' } });
  assert.notEqual(response.isError, true);
  assert.deepEqual(response.structuredContent, await findJsx(project));
  const invalid = await client.callTool({ name: 'find_jsx', arguments: { discovery: 'invalid' } });
  assert.equal(invalid.isError, true);
});

test('SWC locates JSX inside defaults, functions, fields, expressions and dense modules', async (t) => {
  const dense = Array.from(
    { length: 500 },
    (_, i) => `const item${i} = <Button label="${i}" />;`
  ).join('\n');
  const project = fixture(t, {
    'ui.tsx': ui,
    'app.tsx': `import {Button} from './ui';
      const object = {render: () => <Button />};
      function render(view = <Button />) { return view; }
      class View { field = <Button />; method() { return flag ? <Button /> : <Button />; } }
      const namespaced = <svg:path />;
      ${dense}`,
  });
  const snapshot = await createJsxSnapshot(project);
  const swc = collectJsxWithSwc(snapshot);
  assert.deepEqual(swc.fallbackFiles, []);
  assert.equal(swc.matches.length, 506);
  assert.deepEqual(swc.matches, collectJsx(snapshot).matches);
});

test('SWC discovery cannot resolve an outside dependency through a symlink', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'swc-boundary-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const root = path.join(directory, 'project');
  fs.mkdirSync(path.join(root, 'node_modules', 'private-ui'), { recursive: true });
  const outside = path.join(directory, 'private.tsx');
  fs.writeFileSync(outside, 'export const Button = () => <Private secret="must-not-leak" />;');
  fs.symlinkSync(outside, path.join(root, 'node_modules', 'private-ui', 'index.tsx'));
  fs.writeFileSync(
    path.join(root, 'app.tsx'),
    "import {Button} from 'private-ui'; const view = <Button />;"
  );
  const project = new ProjectWorkspace({ root });
  const result = await findJsx(project, { discovery: 'swc' });
  assert.equal(result.total, 1);
  assert.equal(result.complete, false);
  assert.deepEqual(result, await findJsx(project));
  assert.equal(JSON.stringify(result).includes('must-not-leak'), false);
});

test('neither discovery backend executes imported application code', async (t) => {
  const project = fixture(t, {
    'ui.tsx': `throw new Error('APPLICATION CODE MUST NOT RUN'); export const Button = () => null;`,
    'app.tsx':
      "import {Button} from './ui'; const view = <Button label={(() => {throw new Error('NO EVALUATION');})()} />;",
  });
  const result = await findJsx(project, { discovery: 'swc' });
  assert.equal(result.total, 1);
  assert.equal(result.matches[0].props.label.status, 'unknown');
  assert.deepEqual(result, await findJsx(project));
});
