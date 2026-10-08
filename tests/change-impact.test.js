import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ProjectWorkspace } from '../dist/project.js';
import { analyzePropRemoval } from '../dist/change-impact.js';

function fixture(t, files) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-impact-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [name, source] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), source);
  }
  return new ProjectWorkspace({ root });
}

// Acceptance contract: proven presence is affected, even with a dynamic value.
// Unknown spreads cannot prove presence or absence. An explicit prop survives a
// later spread as a present prop. Children count; inherited object keys do not.
// Decisions authorized before implementation: trim component/prop names; report
// one uncertainty per possibly supplied prop at each call site. Never edit files.
for (const [label, jsx, prop, affected, complete, value] of [
  [
    'explicit literal',
    '<Button label="Save" />',
    'label',
    1,
    true,
    { status: 'known', value: 'Save' },
  ],
  [
    'boolean shorthand',
    '<Button disabled />',
    'disabled',
    1,
    true,
    { status: 'known', value: true },
  ],
  [
    'false value',
    '<Button disabled={false} />',
    'disabled',
    1,
    true,
    { status: 'known', value: false },
  ],
  [
    'dynamic value',
    '<Button label={compute()} />',
    'label',
    1,
    true,
    { status: 'unknown', expression: 'compute()' },
  ],
  [
    'literal spread',
    '<Button {...{label: "Save"}} />',
    'label',
    1,
    true,
    { status: 'known', value: 'Save' },
  ],
  ['absent prop', '<Button />', 'label', 0, true, undefined],
  ['unknown spread', '<Button {...rest} />', 'label', 0, false, undefined],
  [
    'explicit prop before spread',
    '<Button label="Save" {...rest} />',
    'label',
    1,
    true,
    { status: 'unknown', expression: 'rest' },
  ],
  [
    'explicit prop after spread',
    '<Button {...rest} label="Save" />',
    'label',
    1,
    true,
    { status: 'known', value: 'Save' },
  ],
  ['different component', '<Other label="Save" />', 'label', 0, true, undefined],
  ['unrelated unknown spread', '<Other {...rest} />', 'label', 0, true, undefined],
  ['inherited key', '<Button />', 'constructor', 0, true, undefined],
  [
    'own prototype key',
    '<Button {...{["__proto__"]: "own"}} />',
    '__proto__',
    1,
    true,
    { status: 'known', value: 'own' },
  ],
  ['children', '<Button>Hello</Button>', 'children', 1, true, { status: 'known', value: 'Hello' }],
  [
    'dynamic children',
    '<Button>{content}</Button>',
    'children',
    1,
    true,
    { status: 'unknown', expression: 'content' },
  ],
  ['comment-only children', '<Button>{/* note */}</Button>', 'children', 0, true, undefined],
]) {
  test(`prop removal impact: ${label}`, async (t) => {
    const project = fixture(t, { 'app.tsx': `const x = ${jsx};` });
    const result = await analyzePropRemoval(project, { component: 'Button', prop });
    assert.equal(result.total, affected);
    assert.equal(result.matches.length, affected);
    assert.equal(result.complete, complete);
    assert.equal(result.limit, 100);
    assert.equal(result.offset, 0);
    assert.equal(result.nextOffset, null);
    assert.deepEqual(result.summary, {
      action: 'remove-prop',
      component: 'Button',
      prop,
      affected,
      unresolved: complete ? 0 : 1,
    });
    if (affected) {
      assert.equal(result.matches[0].prop, prop);
      assert.deepEqual(result.matches[0].value, value);
    }
  });
}

for (const [jsx, value] of [
  ['<Button {...{label: compute()}} />', { status: 'unknown', expression: 'compute()' }],
  ['<Button {...{label: "Save", other: compute()}} />', { status: 'known', value: 'Save' }],
  ['<Button {...{label}} />', { status: 'unknown', expression: 'label' }],
  ['<Button {...{...rest, label: "Save"}} />', { status: 'known', value: 'Save' }],
]) {
  test(`prop removal preserves statically proven spread presence: ${jsx}`, async (t) => {
    const project = fixture(t, { 'app.tsx': `const x = ${jsx};` });
    const result = await analyzePropRemoval(project, { component: 'Button', prop: 'label' });
    assert.equal(result.total, 1);
    assert.equal(result.complete, true);
    assert.equal(result.summary.affected, 1);
    assert.deepEqual(result.matches[0].value, value);
  });
}

test('impact resolves aliased barrels while excluding other sources and shadowed bindings', async (t) => {
  const project = fixture(t, {
    'ui.tsx': 'export const Button = (props: any) => null;',
    'barrel.ts': "export { Button as Action } from './ui';",
    'other.tsx': 'export const Button = (props: any) => null;',
    'app.tsx':
      'import { Action as B } from \'./barrel\';\nimport { Button as Other } from \'./other\';\nconst x = <><B label="Save" /><Other label="other" /></>;\nfunction local(B: any) { return <B label="shadow" />; }',
  });
  const result = await analyzePropRemoval(project, {
    component: 'Button',
    source: './ui',
    prop: 'label',
  });
  assert.equal(result.complete, true);
  assert.equal(result.total, 1);
  assert.deepEqual(result.matches[0], {
    filePath: path.join(project.root, 'app.tsx'),
    line: 3,
    column: 13,
    snippet: 'const x = <><B label="Save" /><Other label="other" /></>;',
    component: 'B',
    identity: {
      exportName: 'Action',
      source: './barrel',
      definition: { filePath: path.join(project.root, 'ui.tsx'), name: 'Button' },
    },
    prop: 'label',
    value: { status: 'known', value: 'Save' },
  });
});

test('unknown spreads report the proposed prop and call-site location without inventing a usage', async (t) => {
  const project = fixture(t, { 'app.tsx': 'const x = <Button {...first} {...second} />;' });
  const result = await analyzePropRemoval(project, { component: 'Button', prop: 'label' });
  assert.deepEqual(result.matches, []);
  assert.deepEqual(result.unresolved, [
    {
      filePath: path.join(project.root, 'app.tsx'),
      line: 1,
      column: 11,
      reason: 'Unknown JSX spread may supply prop label: first, second.',
    },
  ]);
});

test('unresolved imported definitions retain known affected usages and mark analysis incomplete', async (t) => {
  const project = fixture(t, {
    'app.tsx': 'import { Button as B } from \'./missing\'; const x = <B label="Save" />;',
  });
  const result = await analyzePropRemoval(project, {
    component: 'Button',
    source: './missing',
    prop: 'label',
  });
  assert.equal(result.total, 1);
  assert.equal(result.complete, false);
  assert.deepEqual(result.matches[0].identity, { exportName: 'Button', source: './missing' });
  assert.deepEqual(result.unresolved, [
    {
      filePath: path.join(project.root, 'app.tsx'),
      line: 1,
      column: 52,
      reason: 'Cannot resolve component definition from ./missing.',
    },
  ]);
  assert.equal(result.summary.unresolved, 1);
});

test('malformed source remains incomplete even with no proven affected usage', async (t) => {
  const project = fixture(t, { 'app.tsx': 'const x = <Button;' });
  const result = await analyzePropRemoval(project, { component: 'Button', prop: 'label' });
  assert.equal(result.total, 0);
  assert.equal(result.complete, false);
  assert.ok(result.unresolved.some(({ reason }) => reason.startsWith('Parse error:')));
  assert.ok(
    result.unresolved.every(({ filePath }) => filePath === path.join(project.root, 'app.tsx'))
  );
});

test('empty projects have a complete unaffected summary', async (t) => {
  const result = await analyzePropRemoval(fixture(t, {}), { component: 'Button', prop: 'label' });
  assert.deepEqual(result.matches, []);
  assert.deepEqual(result.unresolved, []);
  assert.deepEqual(result.summary, {
    action: 'remove-prop',
    component: 'Button',
    prop: 'label',
    affected: 0,
    unresolved: 0,
  });
  assert.equal(result.complete, true);
});

test('impact considers callers beyond the default query page', async (t) => {
  const project = fixture(t, {
    'app.tsx': `const x = <>\n${'<Button />\n'.repeat(100)}<Button label="last" /></>;`,
  });
  const result = await analyzePropRemoval(project, {
    component: 'Button',
    prop: 'label',
    limit: 1,
  });
  assert.equal(result.total, 1);
  assert.equal(result.matches[0].line, 102);
  assert.equal(result.summary.affected, 1);
});

test('impact pages sorted usages without changing the complete affected total', async (t) => {
  const project = fixture(t, {
    'z.tsx': 'const z = <Button label="last" />;',
    'a.tsx': 'const a = <Button label="first" />;\nconst b = <Button label="middle" />;',
  });
  const result = await analyzePropRemoval(project, {
    component: 'Button',
    prop: 'label',
    offset: 1,
    limit: 1,
  });
  assert.equal(result.total, 3);
  assert.equal(result.matches.length, 1);
  assert.equal(result.nextOffset, 2);
  assert.equal(result.summary.affected, 3);
  assert.deepEqual(result.matches[0], {
    filePath: path.join(project.root, 'a.tsx'),
    line: 2,
    column: 11,
    snippet: 'const b = <Button label="middle" />;',
    component: 'Button',
    identity: null,
    prop: 'label',
    value: { status: 'known', value: 'middle' },
  });
  const last = await analyzePropRemoval(project, {
    component: 'Button',
    prop: 'label',
    offset: 3,
    limit: 1,
  });
  assert.deepEqual(last.matches, []);
  assert.equal(last.total, 3);
  assert.equal(last.summary.affected, 3);
  assert.equal(last.nextOffset, null);
});

test('the default page cap retains all affected usages in its summary', async (t) => {
  const project = fixture(t, {
    'app.tsx': `const x = <>${'<Button label="Save" />'.repeat(101)}</>;`,
  });
  const result = await analyzePropRemoval(project, { component: 'Button', prop: 'label' });
  assert.equal(result.matches.length, 100);
  assert.equal(result.total, 101);
  assert.equal(result.nextOffset, 100);
  assert.equal(result.summary.affected, 101);
});

test('path selection limits affected source files', async (t) => {
  const project = fixture(t, {
    'app.tsx': 'const x = <Button label="Save" />;',
    'other.tsx': 'const x = <Button />;',
  });
  const result = await analyzePropRemoval(project, {
    component: 'Button',
    prop: 'label',
    path: 'other.tsx',
  });
  assert.equal(result.total, 0);
  assert.equal(result.complete, true);
});

test('repeated analysis observes both updated caller props and module exports', async (t) => {
  const project = fixture(t, {
    'ui.tsx': 'export const Button = () => null;',
    'app.tsx': 'import { Button } from \'./ui\'; const x = <Button label="first" />;',
  });
  const query = { component: 'Button', source: './ui', prop: 'label' };
  assert.equal((await analyzePropRemoval(project, query)).complete, true);
  fs.writeFileSync(path.join(project.root, 'ui.tsx'), 'export const Other = () => null;');
  assert.equal((await analyzePropRemoval(project, query)).complete, false);
  fs.writeFileSync(
    path.join(project.root, 'app.tsx'),
    'import { Other as Button } from \'./ui\'; const x = <Button label="updated" />;'
  );
  const updated = await analyzePropRemoval(project, query);
  assert.equal(updated.complete, true);
  assert.deepEqual(updated.matches[0].value, { status: 'known', value: 'updated' });
});

test('analysis leaves every source file unchanged', async (t) => {
  const files = {
    'app.tsx': 'const x = <Button label="Save" />;',
    'ui.tsx': 'export const Button = () => null;',
  };
  const project = fixture(t, files);
  const before = Object.fromEntries(
    Object.keys(files).map((name) => [name, fs.readFileSync(path.join(project.root, name))])
  );
  await analyzePropRemoval(project, { component: 'Button', prop: 'label' });
  assert.deepEqual(fs.readdirSync(project.root).sort(), ['app.tsx', 'ui.tsx']);
  for (const name of Object.keys(files))
    assert.deepEqual(fs.readFileSync(path.join(project.root, name)), before[name]);
});

test('proposed names are trimmed consistently in matches and the summary', async (t) => {
  const project = fixture(t, { 'app.tsx': 'const x = <Button label="Save" />;' });
  const result = await analyzePropRemoval(project, { component: ' Button ', prop: ' label ' });
  assert.equal(result.total, 1);
  assert.equal(result.matches[0].prop, 'label');
  assert.equal(result.summary.component, 'Button');
  assert.equal(result.summary.prop, 'label');
});

for (const names of [{ component: '' }, { component: ' ' }, { prop: '' }, { prop: ' ' }]) {
  test(`empty proposed names are rejected: ${JSON.stringify(names)}`, async (t) => {
    await assert.rejects(
      analyzePropRemoval(fixture(t, {}), { component: 'Button', prop: 'label', ...names })
    );
  });
}

// Shared page bounds: smallest, just below/on/above maximum, and invalid offset.
for (const limit of [1, 499, 500]) {
  test(`accepted page boundary: ${limit}`, async (t) => {
    const result = await analyzePropRemoval(fixture(t, {}), {
      component: 'Button',
      prop: 'label',
      limit,
    });
    assert.equal(result.limit, limit);
  });
}
for (const page of [
  { limit: 0 },
  { limit: 501 },
  { limit: 1.5 },
  { offset: -1 },
  { offset: 0.5 },
]) {
  test(`rejected page boundary: ${JSON.stringify(page)}`, async (t) => {
    await assert.rejects(
      analyzePropRemoval(fixture(t, {}), { component: 'Button', prop: 'label', ...page }),
      RangeError
    );
  });
}
