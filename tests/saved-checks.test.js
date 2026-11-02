import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ProjectWorkspace } from '../dist/project.js';
import {
  ConfigurationError,
  loadSavedChecks,
  runSavedChecks,
  checkExitCode,
} from '../dist/saved-checks.js';

// Acceptance spec: real saved JSON -> guarded filesystem -> real JSX analysis.
// Complete/no findings => 0; complete/any findings => 1; incomplete => 2 even
// with known findings. Invalid saved configuration throws ConfigurationError (2).
// Pagination never hides the overall failure. Reads never change source or rules.
const required = { component: 'Button', required: ['label'] };
const deprecated = { component: 'Button', deprecated: ['old'] };
const document = (rules = [required]) => JSON.stringify({ version: 1, rules });

function fixture(t, source = 'const view = <Button label="ready" />;', rules = document()) {
  const parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'saved-jsx-')));
  const root = path.join(parent, 'project');
  fs.mkdirSync(root);
  fs.writeFileSync(path.join(root, 'App.tsx'), source);
  fs.writeFileSync(path.join(root, 'rules.json'), rules);
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  return { parent, root, project: new ProjectWorkspace({ root }) };
}

for (const [label, source, rules, status, findings, unresolved, exitCode] of [
  ['complete pass', '<Button label="ready" />', [required], 'pass', 0, 0, 0],
  ['deprecated prop', '<Button old />', [deprecated], 'fail', 1, 0, 1],
  ['required prop missing', '<Button />', [required], 'fail', 1, 0, 1],
  [
    'forbidden prop',
    '<Button secret />',
    [{ component: 'Button', forbidden: ['secret'] }],
    'fail',
    1,
    0,
    1,
  ],
  ['unknown spread', '<Button {...props} />', [required], 'incomplete', 0, 1, 2],
  [
    'known violation and unknown spread',
    '<Button old {...props} />',
    [{ ...required, deprecated: ['old'] }],
    'incomplete',
    1,
    1,
    2,
  ],
]) {
  test(`saved checks report ${label}`, async (t) => {
    const { project } = fixture(t, `const view = ${source};`, document(rules));
    const result = await runSavedChecks(project, { rulesFile: 'rules.json' });
    assert.deepEqual(result.summary, { status, findings, unresolved });
    assert.equal(result.exitCode, exitCode);
    assert.equal(checkExitCode(result), exitCode);
    assert.equal(result.total, findings);
    assert.equal(result.complete, status !== 'incomplete');
  });
}

test('loading returns the versioned document with normalized rules', (t) => {
  const { project } = fixture(
    t,
    undefined,
    document([{ id: ' custom ', component: ' Button ', required: [' label '] }])
  );
  assert.deepEqual(loadSavedChecks(project, 'rules.json'), {
    version: 1,
    rules: [{ id: 'custom', component: 'Button', required: ['label'] }],
  });
});

test('rules without IDs receive stable positional finding IDs', async (t) => {
  const { project } = fixture(t, 'const view = <Button old />;', document([required, deprecated]));
  const result = await runSavedChecks(project, { rulesFile: 'rules.json' });
  assert.deepEqual(
    result.matches.map(({ ruleId, kind, prop }) => ({ ruleId, kind, prop })),
    [
      { ruleId: 'rule-1', kind: 'missing', prop: 'label' },
      { ruleId: 'rule-2', kind: 'deprecated', prop: 'old' },
    ]
  );
});

test('an empty final page retains the overall failure exit code', async (t) => {
  const { project } = fixture(t, 'const view = <Button old />;', document([deprecated]));
  const result = await runSavedChecks(project, { rulesFile: 'rules.json', offset: 1, limit: 1 });
  assert.deepEqual(result.matches, []);
  assert.equal(result.total, 1);
  assert.equal(result.offset, 1);
  assert.equal(result.limit, 1);
  assert.equal(result.nextOffset, null);
  assert.equal(result.exitCode, 1);
});

test('the optional query path limits the audited source', async (t) => {
  const { root, project } = fixture(t, 'const view = <Button old />;', document([deprecated]));
  fs.writeFileSync(path.join(root, 'Clean.tsx'), 'const view = <Button />;');
  const result = await runSavedChecks(project, { rulesFile: 'rules.json', path: 'Clean.tsx' });
  assert.equal(result.exitCode, 0);
  assert.equal(result.total, 0);
});

for (const [label, rules] of [
  ['invalid JSON', '{broken'],
  ['wrong version', JSON.stringify({ version: 2, rules: [required] })],
  ['missing version', JSON.stringify({ rules: [required] })],
  ['unknown document key', JSON.stringify({ version: 1, rules: [required], extra: true })],
  ['array document', '[]'],
  ['null document', 'null'],
  ['empty rules', document([])],
  ['missing rules', '{"version":1}'],
  ['non-array rules', document(required)],
  ['unknown rule key', document([{ ...required, extra: true }])],
  ['rule with no checks', document([{ component: 'Button' }])],
  [
    'duplicate IDs',
    document([
      { ...required, id: 'same' },
      { ...deprecated, id: 'same' },
    ]),
  ],
  ['ID colliding with a positional default', document([{ ...required, id: 'rule-2' }, deprecated])],
]) {
  test(`saved checks reject ${label} as configuration failure`, async (t) => {
    const { project } = fixture(t, undefined, rules);
    const expected = (error) => {
      assert.ok(error instanceof ConfigurationError);
      assert.equal(error.name, 'ConfigurationError');
      assert.equal(error.exitCode, 2);
      assert.match(error.message, /rules\.json/);
      assert.ok(error.cause instanceof Error);
      return true;
    };
    assert.throws(() => loadSavedChecks(project, 'rules.json'), expected);
    await assert.rejects(runSavedChecks(project, { rulesFile: 'rules.json' }), expected);
  });
}

for (const kind of ['missing', 'directory', 'outside', 'symlink']) {
  test(`saved checks reject a ${kind} rules file as configuration failure`, async (t) => {
    const { parent, root, project } = fixture(t);
    const outside = path.join(parent, 'outside.json');
    fs.writeFileSync(outside, document());
    const candidates = {
      missing: 'missing.json',
      directory: '.',
      outside: outside,
      symlink: 'linked.json',
    };
    if (kind === 'symlink') fs.symlinkSync(outside, path.join(root, 'linked.json'));
    await assert.rejects(runSavedChecks(project, { rulesFile: candidates[kind] }), (error) => {
      assert.ok(error instanceof ConfigurationError);
      assert.equal(error.exitCode, 2);
      assert.ok(error.message.includes(candidates[kind]));
      return true;
    });
  });
}

test('analysis access failures propagate instead of reporting a pass or invalid rules', async (t) => {
  const { project } = fixture(t);
  await assert.rejects(
    runSavedChecks(project, { rulesFile: 'rules.json', path: '../outside' }),
    (error) => {
      assert.equal(error instanceof ConfigurationError, false);
      assert.match(error.message, /outside project root/);
      return true;
    }
  );
});

test('repeated runs are identical and leave source and rule bytes untouched', async (t) => {
  const { root, project } = fixture(t, 'const view = <Button old />;', document([deprecated]));
  const sourceBefore = fs.readFileSync(path.join(root, 'App.tsx'));
  const rulesBefore = fs.readFileSync(path.join(root, 'rules.json'));
  const first = await runSavedChecks(project, { rulesFile: 'rules.json' });
  const second = await runSavedChecks(project, { rulesFile: 'rules.json' });
  assert.deepEqual(second, first);
  assert.deepEqual(fs.readFileSync(path.join(root, 'App.tsx')), sourceBefore);
  assert.deepEqual(fs.readFileSync(path.join(root, 'rules.json')), rulesBefore);
});

test('subsequent runs observe both source and saved rule updates', async (t) => {
  const { root, project } = fixture(t, 'const view = <Button old />;', document([deprecated]));
  assert.equal((await runSavedChecks(project, { rulesFile: 'rules.json' })).exitCode, 1);
  fs.writeFileSync(path.join(root, 'App.tsx'), 'const view = <Button label="ready" />;');
  assert.equal((await runSavedChecks(project, { rulesFile: 'rules.json' })).exitCode, 0);
  fs.writeFileSync(
    path.join(root, 'rules.json'),
    document([{ component: 'Button', forbidden: ['label'] }])
  );
  assert.equal((await runSavedChecks(project, { rulesFile: 'rules.json' })).exitCode, 1);
});
