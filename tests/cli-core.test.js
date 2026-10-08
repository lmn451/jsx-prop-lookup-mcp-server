import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseCommandLine, executeCommand, renderHumanResult, cliError } from '../dist/cli.js';

// Public command adapter contracts. Real filesystem and analysis are used here;
// subprocess/MCP parity is covered separately in commands.test.js.
test('argument parsing selects serving by default and retains only explicit query options', () => {
  assert.deepEqual(parseCommandLine([], {}), {
    action: 'run',
    command: 'serve',
    json: false,
    legacyTools: false,
    project: { root: undefined, allowedRoots: [], tsconfig: undefined },
    query: {},
    rulesFile: undefined,
  });
  const parsed = parseCommandLine(
    [
      'query',
      '--path',
      'src',
      '--component',
      'Button',
      '--source',
      './ui',
      '--prop',
      'title',
      '--value',
      '',
      '--offset',
      '0',
      '--limit',
      '500',
      '--json',
    ],
    {}
  );
  assert.equal(parsed.command, 'query');
  assert.equal(parsed.json, true);
  assert.deepEqual(parsed.query, {
    path: 'src',
    component: 'Button',
    source: './ui',
    prop: 'title',
    value: '',
    offset: 0,
    limit: 500,
  });
});

test('shared roots trim the allowlist and CLI values take precedence over environment', () => {
  const env = { PROJECT_ROOT: '/env/project', ALLOWED_ROOTS: '/env/allowed' };
  assert.deepEqual(parseCommandLine(['query'], env).project, {
    root: '/env/project',
    allowedRoots: ['/env/allowed'],
    tsconfig: undefined,
  });
  assert.deepEqual(
    parseCommandLine(
      [
        'query',
        '--project-root',
        '/cli/project',
        '--allowed-roots',
        ' /one, , /two ',
        '--tsconfig',
        'custom.json',
      ],
      env
    ).project,
    { root: '/cli/project', allowedRoots: ['/one', '/two'], tsconfig: 'custom.json' }
  );
  assert.deepEqual(
    parseCommandLine(['query', '--allowed-roots', ''], env).project.allowedRoots,
    []
  );
});

test('help and version are explicit non-running actions', () => {
  assert.deepEqual(parseCommandLine(['--help'], {}), { action: 'help' });
  assert.deepEqual(parseCommandLine(['-h'], {}), { action: 'help' });
  assert.deepEqual(parseCommandLine(['--version'], {}), { action: 'version' });
});

for (const args of [
  ['bogus'],
  ['query', 'extra'],
  ['--missing'],
  ['inspect'],
  ['inspect', '--component', ' '],
  ['check'],
  ['check', '--rules', ''],
  ['check', '--rules', ' '],
  ['query', '--value', 'x'],
  ['query', '--rules', 'rules.json'],
  ['inspect', '--component', 'Button', '--prop', 'label'],
  ['serve', '--json'],
  ['query', '--legacy-tools'],
  ['check', '--rules', 'rules.json', '--source', './ui'],
  ['query', '--offset', ''],
  ['query', '--offset', ' '],
  ['query', '--offset', '-1'],
  ['query', '--offset', '1.5'],
  ['query', '--offset', 'Infinity'],
  ['query', '--limit', '0'],
  ['query', '--limit', '501'],
  ['query', '--limit', 'x'],
]) {
  test(`argument parsing rejects ${JSON.stringify(args)}`, () => {
    assert.throws(
      () => parseCommandLine(args, {}),
      (error) => {
        assert.ok(error instanceof Error);
        assert.notEqual(error.message.trim(), '');
        return true;
      }
    );
  });
}

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-command-core-')));
  fs.writeFileSync(
    path.join(root, 'Button.tsx'),
    'export function Button({label}: Props) { return null; }\ninterface Props { label: string; }'
  );
  fs.writeFileSync(
    path.join(root, 'App.tsx'),
    "import { Button } from './Button';\nconst view = <Button />;"
  );
  fs.writeFileSync(
    path.join(root, 'rules.json'),
    JSON.stringify({ version: 1, rules: [{ component: 'Button', required: ['label'] }] })
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test('command execution dispatches queries, inspection, and saved rules through the real workspace', async (t) => {
  const root = fixture(t);
  const run = (...args) => executeCommand(parseCommandLine([...args, '--project-root', root], {}));
  const query = await run('query', '--component', 'Button');
  assert.equal(query.exitCode, 0);
  assert.deepEqual(
    query.result.matches.map((match) => match.component),
    ['Button']
  );
  const inspection = await run('inspect', '--component', 'Button');
  assert.equal(inspection.exitCode, 0);
  assert.deepEqual(inspection.result.matches[0].props, [
    { name: 'label', type: 'string', required: true },
  ]);
  const check = await run('check', '--rules', 'rules.json');
  assert.equal(check.exitCode, 1);
  assert.deepEqual(
    check.result.matches.map((match) => match.kind),
    ['missing']
  );
  const missing = await run('inspect', '--component', 'Absent');
  assert.equal(missing.exitCode, 2);
  fs.writeFileSync(path.join(root, 'App.tsx'), 'const view = <Button {...props} />;');
  assert.equal((await run('query')).exitCode, 2);
  assert.equal((await run('check', '--rules', 'rules.json')).exitCode, 2);
  await assert.rejects(run('serve'), /serve/);
});

test('human rendering exposes located matches, findings, props, empty pages, and uncertainty', async (t) => {
  const root = fixture(t);
  const run = (...args) => executeCommand(parseCommandLine([...args, '--project-root', root], {}));
  assert.match(renderHumanResult((await run('query')).result), /App\.tsx:2:14.*Button/);
  assert.match(
    renderHumanResult((await run('inspect', '--component', 'Button')).result),
    /Button\.tsx:1:1.*Button.*label.*string/
  );
  assert.match(
    renderHumanResult((await run('check', '--rules', 'rules.json')).result),
    /App\.tsx:2:14.*missing prop label/
  );
  assert.match(
    renderHumanResult((await run('query', '--component', 'Absent')).result),
    /No matches/
  );
  assert.match(
    renderHumanResult((await run('query', '--offset', '1')).result),
    /No matches on this page.*1 total/
  );
  assert.match(
    renderHumanResult((await run('inspect', '--component', 'Absent')).result),
    /Unresolved:.*Component Absent not found/
  );
});

test('CLI errors serialize both Error objects and other thrown values', () => {
  assert.deepEqual(cliError(new Error('unavailable')), {
    error: { message: 'unavailable' },
    exitCode: 2,
  });
  assert.deepEqual(cliError('unavailable'), { error: { message: 'unavailable' }, exitCode: 2 });
});

test('inspect and check accept their page, path, source, and JSON options', () => {
  const inspected = parseCommandLine(
    [
      'inspect',
      '--component',
      'Button',
      '--path',
      'src',
      '--source',
      './ui',
      '--offset',
      '501',
      '--limit',
      '1',
      '--json',
    ],
    {}
  );
  assert.equal(inspected.json, true);
  assert.deepEqual(inspected.query, {
    component: 'Button',
    path: 'src',
    source: './ui',
    offset: 501,
    limit: 1,
  });
  const checked = parseCommandLine(
    [
      'check',
      '--rules',
      'checks.json',
      '--path',
      'src',
      '--offset',
      '1',
      '--limit',
      '500',
      '--json',
    ],
    {}
  );
  assert.equal(checked.json, true);
  assert.equal(checked.rulesFile, 'checks.json');
  assert.deepEqual(checked.query, { path: 'src', offset: 1, limit: 500 });
  const legacy = parseCommandLine(['serve', '--legacy-tools'], {});
  assert.equal(legacy.command, 'serve');
  assert.equal(legacy.legacyTools, true);
});

test('missing flags and invalid page values explain the applicable requirement', () => {
  assert.throws(() => parseCommandLine(['inspect'], {}), /--component/);
  assert.throws(() => parseCommandLine(['check'], {}), /--rules/);
  assert.throws(
    () => parseCommandLine(['query', '--offset', '1.5'], {}),
    /--offset.*non-negative.*integer/
  );
  assert.throws(() => parseCommandLine(['query', '--limit', '0'], {}), /--limit.*1 to 500/);
});

test('human output separates matches and props without spurious empty messages', async (t) => {
  const root = fixture(t);
  fs.writeFileSync(
    path.join(root, 'Button.tsx'),
    'export function Button(props: Props) { return null; }\ninterface Props { label: string; disabled?: boolean; }'
  );
  fs.writeFileSync(
    path.join(root, 'App.tsx'),
    "import { Button } from './Button';\n<Button />;\n<Button />;"
  );
  const run = (...args) => executeCommand(parseCommandLine([...args, '--project-root', root], {}));
  assert.equal(
    renderHumanResult((await run('query')).result),
    `${path.join(root, 'App.tsx')}:2:1 Button\n${path.join(root, 'App.tsx')}:3:1 Button`
  );
  assert.equal(
    renderHumanResult((await run('inspect', '--component', 'Button')).result),
    `${path.join(root, 'Button.tsx')}:1:1 Button: label: string, disabled: boolean`
  );
  assert.equal(
    renderHumanResult((await run('query', '--component', 'Absent')).result),
    'No matches.'
  );
});
