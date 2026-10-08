import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('..', import.meta.url));
const fixture = path.join(repository, 'examples/audit');
const executable = path.join(repository, 'dist/index.js');

function run(command, flags = []) {
  const child = spawnSync(
    process.execPath,
    [executable, command, '--project-root', fixture, ...flags, '--json'],
    {
      cwd: repository,
      encoding: 'utf8',
      timeout: 15_000,
      env: { ...process.env, ALLOWED_ROOTS: '', PROJECT_ROOT: '' },
    }
  );
  assert.equal(child.error, undefined);
  assert.equal(child.signal, null);
  assert.equal(child.stderr, '');
  return { code: child.status, result: JSON.parse(child.stdout) };
}

function fixtureBytes() {
  return readdirSync(fixture, { recursive: true, withFileTypes: true })
    .filter((item) => item.isFile())
    .map((item) => path.join(item.parentPath, item.name))
    .sort()
    .map((file) => [path.relative(fixture, file), readFileSync(file).toString('base64')]);
}

test('documented migration query finds all four aliased callers and labels the unknown spread', () => {
  const { code, result } = run('query', ['--component', 'Button', '--source', './Button']);
  assert.equal(code, 2);
  assert.equal(result.total, 4);
  assert.deepEqual(
    result.matches.map((match) => path.basename(match.filePath)),
    ['Dynamic.tsx', 'Good.tsx', 'Legacy.tsx', 'Missing.tsx']
  );
  assert.ok(result.matches.every((match) => match.component === 'Action'));
  assert.equal(result.complete, false);
  assert.ok(result.unresolved.some((item) => item.reason.includes('spread')));
});

test('documented inspection shows the declared contract, deprecation and literal default', () => {
  const { code, result } = run('inspect', ['--component', 'Button']);
  assert.equal(code, 0);
  assert.equal(result.total, 1);
  const component = result.matches[0];
  assert.equal(path.basename(component.filePath), 'Button.tsx');
  const props = Object.fromEntries(component.props.map((prop) => [prop.name, prop]));
  assert.equal(props.label.required, true);
  assert.match(props.label.description, /Accessible text/);
  assert.equal(props.variant.required, false);
  assert.match(props.variant.deprecated, /appearance token/);
  assert.deepEqual(props.disabled.default, { status: 'known', value: false });
});

for (const [file, code, kinds, complete] of [
  ['Good.tsx', 0, [], true],
  ['Legacy.tsx', 1, ['deprecated'], true],
  ['Dynamic.tsx', 2, [], false],
]) {
  test(`documented saved check for ${file} exits ${code}`, () => {
    const { code: actual, result } = run('check', [
      '--path',
      `src/${file}`,
      '--rules',
      'rules.json',
    ]);
    assert.equal(actual, code);
    assert.equal(result.exitCode, code);
    assert.equal(result.complete, complete);
    assert.deepEqual(
      result.matches.map((finding) => finding.kind),
      kinds
    );
  });
}

test('whole-fixture audit returns both known failures and stays incomplete without changing files', () => {
  const before = fixtureBytes();
  const { code, result } = run('check', ['--rules', 'rules.json']);
  assert.equal(code, 2);
  assert.equal(result.total, 2);
  assert.deepEqual(
    result.matches.map((finding) => [path.basename(finding.filePath), finding.kind, finding.prop]),
    [
      ['Legacy.tsx', 'deprecated', 'variant'],
      ['Missing.tsx', 'missing', 'label'],
    ]
  );
  assert.equal(result.summary.status, 'incomplete');
  assert.equal(result.unresolved.length, 2);
  assert.deepEqual(fixtureBytes(), before);
});

for (const [selection, expectedCode, unknown] of [
  ['.', 2, 1],
  ['src/Legacy.tsx', 0, 0],
]) {
  test(`documented removal preview for ${selection} preserves fixture files`, () => {
    const before = fixtureBytes();
    const { code, result } = run('inspect', [
      '--component',
      'Button',
      '--source',
      './Button',
      '--remove-prop',
      'variant',
      '--path',
      selection,
    ]);
    assert.equal(code, expectedCode);
    assert.equal(result.summary.action, 'remove-prop');
    assert.equal(result.summary.affected, 1);
    assert.equal(result.summary.unresolved, unknown);
    assert.equal(path.basename(result.matches[0].filePath), 'Legacy.tsx');
    assert.deepEqual(result.matches[0].value, { status: 'known', value: 'legacy' });
    assert.deepEqual(fixtureBytes(), before);
  });
}
