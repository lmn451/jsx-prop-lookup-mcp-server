import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const executable = fileURLToPath(new URL('../dist/index.js', import.meta.url));
const { version } = JSON.parse(
  fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')
);
const rules = JSON.stringify({ version: 1, rules: [{ component: 'Button', required: ['label'] }] });

// CLI/MCP acceptance: real subprocesses, transport, temporary files, and analysis.
// Query/inspect: complete => 0, incomplete/error => 2. Saved check: 0/1/2.
// Empty command => modern stdio. --legacy-tools explicitly selects the old API.
function fixture(t, files = {}) {
  const parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-cli-')));
  const root = path.join(parent, 'project');
  fs.mkdirSync(root);
  const all = {
    'Button.tsx':
      'export function Button({label, disabled = false}: Props) { return null; }\ninterface Props { label: string; disabled?: boolean; }\n',
    'App.tsx':
      'import { Button as Action } from \'./Button\';\nconst save = <Action label="Save" disabled={false} />;\nconst cancel = <Action label="Cancel" />;\n',
    'rules.json': rules,
    ...files,
  };
  for (const [file, content] of Object.entries(all)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), content);
  }
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  return { parent, root };
}

function environment(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.PROJECT_ROOT;
  delete env.ALLOWED_ROOTS;
  return { ...env, ...extra };
}

function cli(root, args, options = {}) {
  return spawnSync(process.execPath, [executable, ...args], {
    cwd: options.cwd ?? root,
    env: environment(options.env),
    encoding: 'utf8',
    timeout: 10000,
    input: '',
  });
}

async function connect(t, root, args = []) {
  const client = new Client(
    { name: 'modern-cli-tests', version: '1.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } }
  );
  t.after(() => client.close());
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [executable, ...args],
      cwd: root,
      env: environment(),
    })
  );
  return client;
}

test('query filters imported aliases and JSON equals the MCP result', async (t) => {
  const { root } = fixture(t);
  const output = cli(root, [
    'query',
    '--component',
    'Button',
    '--source',
    './Button',
    '--prop',
    'label',
    '--value',
    'Save',
    '--json',
  ]);
  assert.equal(output.status, 0, output.stderr);
  assert.equal(output.stderr, '');
  const result = JSON.parse(output.stdout);
  assert.equal(result.total, 1);
  assert.equal(result.complete, true);
  assert.deepEqual(result.unresolved, []);
  assert.deepEqual(
    result.matches.map(({ component, filePath, line, column, props }) => ({
      component,
      filePath,
      line,
      column,
      props,
    })),
    [
      {
        component: 'Action',
        filePath: path.join(root, 'App.tsx'),
        line: 2,
        column: 14,
        props: {
          label: { status: 'known', value: 'Save' },
          disabled: { status: 'known', value: false },
        },
      },
    ]
  );
  const client = await connect(t, root);
  const response = await client.callTool({
    name: 'find_jsx',
    arguments: { component: 'Button', source: './Button', prop: 'label', value: 'Save' },
  });
  assert.equal(response.isError, undefined);
  assert.deepEqual(JSON.parse(response.content[0].text), result);
});

test('inspect resolves later-declared props and static defaults', (t) => {
  const { root } = fixture(t);
  const output = cli(root, [
    'inspect',
    '--component',
    'Button',
    '--path',
    'Button.tsx',
    '--source',
    './Button',
    '--json',
  ]);
  assert.equal(output.status, 0, output.stderr);
  const result = JSON.parse(output.stdout);
  assert.equal(result.complete, true);
  assert.equal(result.total, 1);
  assert.deepEqual(result.matches[0].props, [
    { name: 'label', type: 'string', required: true },
    {
      name: 'disabled',
      type: 'boolean',
      required: false,
      default: { status: 'known', value: false },
    },
  ]);
});

for (const [label, source, saved, status, exitCode] of [
  ['pass', '<Button label="ready" />', rules, 'pass', 0],
  ['violation', '<Button />', rules, 'fail', 1],
  ['incomplete', '<Button {...props} />', rules, 'incomplete', 2],
  [
    'known violation with uncertainty',
    '<Button old {...props} />',
    JSON.stringify({
      version: 1,
      rules: [{ component: 'Button', required: ['label'], deprecated: ['old'] }],
    }),
    'incomplete',
    2,
  ],
]) {
  test(`check reports ${label} with the required exit status`, (t) => {
    const { root } = fixture(t, { 'App.tsx': `const view = ${source};`, 'rules.json': saved });
    const output = cli(root, ['check', '--rules', 'rules.json', '--json']);
    assert.equal(output.status, exitCode, output.stderr);
    assert.equal(output.stderr, '');
    const result = JSON.parse(output.stdout);
    assert.equal(result.summary.status, status);
    assert.equal(result.exitCode, exitCode);
  });
}

test('invalid saved rules produce only a machine-readable error on JSON stdout', (t) => {
  const { root } = fixture(t, { 'rules.json': '{broken' });
  const output = cli(root, ['check', '--rules', 'rules.json', '--json']);
  assert.equal(output.status, 2);
  assert.equal(output.stderr, '');
  const error = JSON.parse(output.stdout);
  assert.deepEqual(Object.keys(error).sort(), ['error', 'exitCode']);
  assert.deepEqual(Object.keys(error.error), ['message']);
  assert.match(error.error.message, /rules\.json/);
  assert.equal(error.exitCode, 2);
});

test('query and inspect use incomplete exit status when analysis is unresolved', (t) => {
  const { root } = fixture(t, { 'App.tsx': 'const view = <Unknown {...props} />;' });
  for (const args of [['query'], ['inspect', '--component', 'Absent']]) {
    const output = cli(root, [...args, '--json']);
    assert.equal(output.status, 2, output.stderr);
    assert.equal(JSON.parse(output.stdout).complete, false);
  }
});

test('human output includes locations, useful empty output, and unresolved reasons', (t) => {
  const { root } = fixture(t);
  const found = cli(root, ['query', '--prop', 'label', '--value', 'Save']);
  assert.equal(found.status, 0, found.stderr);
  assert.match(found.stdout, /App\.tsx:2:14.*Action/);
  const empty = cli(root, ['query', '--component', 'Absent']);
  assert.equal(empty.status, 0, empty.stderr);
  assert.match(empty.stdout, /No matches/);
  const unknown = cli(root, ['inspect', '--component', 'Absent']);
  assert.equal(unknown.status, 2);
  assert.match(unknown.stdout, /Unresolved:.*Component Absent not found/);
});

test('project and allowed-roots CLI settings override environment values', (t) => {
  const { root, parent } = fixture(t);
  const output = cli(
    root,
    ['query', '--project-root', root, '--allowed-roots', parent, '--path', 'App.tsx', '--json'],
    {
      cwd: parent,
      env: {
        PROJECT_ROOT: path.join(parent, 'missing'),
        ALLOWED_ROOTS: path.join(parent, 'denied'),
      },
    }
  );
  assert.equal(output.status, 0, output.stderr);
  assert.equal(JSON.parse(output.stdout).total, 2);
  const fromEnv = cli(root, ['query', '--json'], {
    cwd: parent,
    env: { PROJECT_ROOT: root, ALLOWED_ROOTS: parent },
  });
  assert.equal(fromEnv.status, 0, fromEnv.stderr);
  assert.equal(JSON.parse(fromEnv.stdout).total, 2);
});

test('query page options and custom tsconfig reach the shared project query', (t) => {
  const { root } = fixture(t, {
    'query.json': '{"files":["App.tsx"]}',
    'Excluded.tsx': 'const hidden = <Button label="Excluded" />;',
  });
  const output = cli(root, [
    'query',
    '--tsconfig',
    'query.json',
    '--offset',
    '1',
    '--limit',
    '1',
    '--json',
  ]);
  assert.equal(output.status, 0, output.stderr);
  const result = JSON.parse(output.stdout);
  assert.equal(result.total, 2);
  assert.equal(result.offset, 1);
  assert.equal(result.limit, 1);
  assert.equal(result.nextOffset, null);
  assert.deepEqual(
    result.matches.map((match) => match.props.label.value),
    ['Cancel']
  );
});

for (const args of [
  ['query', '--unknown'],
  ['unknown-command'],
  ['query', 'extra'],
  ['inspect'],
  ['check'],
  ['query', '--value', 'x'],
  ['serve', '--json'],
  ['query', '--legacy-tools'],
  ['check', '--component', 'Button'],
  ['query', '--offset', '-1'],
  ['query', '--offset', '1.5'],
  ['query', '--offset', 'x'],
  ['query', '--limit', '0'],
  ['query', '--limit', '501'],
  ['query', '--limit', '1.5'],
]) {
  test(`invalid command arguments exit with an error: ${args.join(' ')}`, (t) => {
    const { root } = fixture(t);
    const output = cli(root, args);
    assert.equal(output.status, 2);
    if (args.includes('--json')) {
      assert.equal(JSON.parse(output.stdout).exitCode, 2);
      assert.equal(output.stderr, '');
    } else {
      assert.equal(output.stdout, '');
      assert.match(output.stderr, /^Error:/);
    }
  });
}

test('help and version bypass missing project roots and never start the server', (t) => {
  const { root, parent } = fixture(t);
  for (const flag of ['--help', '--version']) {
    const output = cli(root, [flag, '--project-root', path.join(parent, 'missing')]);
    assert.equal(output.status, 0, output.stderr);
    assert.equal(output.stderr, '');
    assert.ok(output.stdout.includes(version));
    if (flag === '--help') assert.match(output.stdout, /query.*inspect.*check.*serve/s);
    else assert.equal(output.stdout.trim(), version);
  }
});

test('serving rejects a missing project root before advertising readiness', (t) => {
  const { root, parent } = fixture(t);
  const output = cli(root, ['serve', '--project-root', path.join(parent, 'missing')]);
  assert.equal(output.status, 2);
  assert.equal(output.stdout, '');
  assert.match(output.stderr, /^Error:.*missing/);
  assert.equal(output.stderr.includes('running on stdio'), false);
});

for (const args of [[], ['serve']]) {
  test(`${args.length ? 'serve' : 'bare executable'} exposes exactly the modern tools`, async (t) => {
    const { root, parent } = fixture(t);
    const client = await connect(t, root, args);
    const inventory = await client.listTools();
    assert.deepEqual(inventory.tools.map((tool) => tool.name).sort(), [
      'check_jsx',
      'find_jsx',
      'inspect_component',
    ]);
    assert.equal(
      inventory.tools.every((tool) => tool.annotations.readOnlyHint),
      true
    );
    const denied = await client.callTool({ name: 'find_jsx', arguments: { path: parent } });
    assert.equal(denied.isError, true);
    assert.match(denied.content[0].text, /outside project root/);
    const checked = await client.callTool({
      name: 'check_jsx',
      arguments: { rules: [{ component: 'Button', required: ['label'] }] },
    });
    assert.equal(checked.isError, undefined);
    assert.equal(JSON.parse(checked.content[0].text).summary.status, 'pass');
  });
}
