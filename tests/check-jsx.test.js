import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { register } from 'tsx/esm/api';
import { McpServer, InMemoryTransport } from '@modelcontextprotocol/server';
import { Client } from '@modelcontextprotocol/client';
import { serveStdio } from '@modelcontextprotocol/server/stdio';

register();
const { ProjectWorkspace } = await import('../src/project.ts');
const { checkJsx, registerCheckJsxTool, validateRules } = await import('../src/check-jsx.ts');

function project(t, jsx) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'jsx-check-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(
    path.join(root, 'App.tsx'),
    `const Button = (props: any) => null;\nconst App = () => (${jsx});\n`
  );
  return new ProjectWorkspace({ root });
}

// Accepted contract: an explicit or statically spread prop proves presence;
// an unknown spread cannot prove absence. Incomplete analysis takes precedence
// over known findings. Pagination must never hide the total or change status.
for (const [name, jsx, rule, expectedKind, expectedStatus] of [
  ['required prop present', '<Button label="Save" />', { required: ['label'] }, null, 'pass'],
  ['required prop absent', '<Button />', { required: ['label'] }, 'missing', 'fail'],
  ['deprecated prop present', '<Button old />', { deprecated: ['old'] }, 'deprecated', 'fail'],
  ['deprecated prop absent', '<Button />', { deprecated: ['old'] }, null, 'pass'],
  [
    'forbidden prop with false value',
    '<Button unsafe={false} />',
    { forbidden: ['unsafe'] },
    'forbidden',
    'fail',
  ],
  [
    'dynamic value still proves presence',
    '<Button label={compute()} />',
    { required: ['label'] },
    null,
    'pass',
  ],
  [
    'literal spread proves presence',
    '<Button {...{label: "Save"}} />',
    { required: ['label'] },
    null,
    'pass',
  ],
  [
    'unknown spread leaves required prop unresolved',
    '<Button {...props} />',
    { required: ['label'] },
    null,
    'incomplete',
  ],
  [
    'unknown spread may carry forbidden prop',
    '<Button {...props} />',
    { forbidden: ['unsafe'] },
    null,
    'incomplete',
  ],
  [
    'unknown spread may carry deprecated prop',
    '<Button {...props} />',
    { deprecated: ['old'] },
    null,
    'incomplete',
  ],
  [
    'explicit prop after spread proves presence',
    '<Button {...props} label="Save" />',
    { required: ['label'] },
    null,
    'pass',
  ],
  [
    'spread after explicit prop preserves presence',
    '<Button label="Save" {...props} />',
    { required: ['label'] },
    null,
    'pass',
  ],
  [
    'inherited object member is not a supplied prop',
    '<Button />',
    { required: ['constructor'] },
    'missing',
    'fail',
  ],
  [
    'JSX children supply the children prop',
    '<Button>Hello</Button>',
    { required: ['children'] },
    null,
    'pass',
  ],
  [
    'comment-only children do not supply a prop',
    '<Button>{/* comment */}</Button>',
    { required: ['children'] },
    'missing',
    'fail',
  ],
]) {
  test(`audit: ${name}`, async (t) => {
    const workspace = project(t, jsx);
    const result = await checkJsx(workspace, {
      rules: [{ id: 'button', component: 'Button', ...rule }],
    });
    assert.equal(result.summary.status, expectedStatus);
    assert.equal(result.total, expectedKind === null ? 0 : 1);
    assert.deepEqual(
      result.matches.map((item) => item.kind),
      expectedKind === null ? [] : [expectedKind]
    );
    assert.equal(result.complete, expectedStatus !== 'incomplete');
    if (expectedKind !== null) {
      assert.equal(result.matches[0].ruleId, 'button');
      assert.equal(result.matches[0].filePath, path.join(workspace.root, 'App.tsx'));
      assert.equal(result.matches[0].line, 2);
      assert.equal(result.matches[0].column, 20);
      assert.match(result.matches[0].snippet, /Button/);
    }
  });
}

test('audit evaluates every call site before paging and prioritizes incomplete status', async (t) => {
  const workspace = project(t, '<><Button /><Button old /><Button {...props} /></>');
  const result = await checkJsx(workspace, {
    rules: [{ component: 'Button', required: ['label'], deprecated: ['old'] }],
    offset: 1,
    limit: 1,
  });
  assert.equal(result.total, 3);
  assert.equal(result.matches.length, 1);
  assert.equal(result.nextOffset, 2);
  assert.equal(result.summary.status, 'incomplete');
  assert.equal(result.summary.findings, 3);
  assert.equal(result.unresolved.length, 2);
});

test('audit finds the first violation after 100 passing call sites', async (t) => {
  const workspace = project(t, `<>${'<Button label="Save" />'.repeat(100)}<Button /></>`);
  const result = await checkJsx(workspace, {
    rules: [{ component: 'Button', required: ['label'] }],
  });
  assert.equal(result.total, 1);
  assert.equal(result.matches[0].kind, 'missing');
  assert.equal(result.summary.status, 'fail');
  assert.equal(result.complete, true);
});

for (const jsx of [
  '<Button {...{label: compute()}} />',
  '<Button {...{label: "Save", other: compute()}} />',
  '<Button {...{label}} />',
  '<Button {...{...rest, label: "Save"}} />',
]) {
  test(`audit preserves statically proven spread presence: ${jsx}`, async (t) => {
    const workspace = project(t, jsx);
    const result = await checkJsx(workspace, {
      rules: [{ component: 'Button', required: ['label'], deprecated: ['label'] }],
    });
    assert.equal(result.complete, true);
    assert.equal(result.summary.status, 'fail');
    assert.deepEqual(
      result.matches.map(({ kind, prop }) => ({ kind, prop })),
      [{ kind: 'deprecated', prop: 'label' }]
    );
  });
}

test('audit filters aliases by original export and source', async (t) => {
  const workspace = project(t, '<><B /><Other /></>');
  writeFileSync(
    path.join(workspace.root, 'Button.tsx'),
    'export const Button = (props: any) => null;'
  );
  writeFileSync(
    path.join(workspace.root, 'Other.tsx'),
    'export const Button = (props: any) => null;'
  );
  writeFileSync(
    path.join(workspace.root, 'App.tsx'),
    'import { Button as B } from "./Button";\nimport { Button as Other } from "./Other";\nconst App = () => <><B /><Other /></>;'
  );
  const result = await checkJsx(workspace, {
    rules: [{ component: 'Button', source: './Button', required: ['label'] }],
  });
  assert.deepEqual(
    result.matches.map((item) => [item.component, item.prop]),
    [['B', 'label']]
  );
  assert.equal(result.summary.status, 'fail');
});

test('empty projects pass and malformed source remains explicitly incomplete', async (t) => {
  const workspace = project(t, '<Button label="x" />');
  writeFileSync(path.join(workspace.root, 'App.tsx'), '');
  const query = { rules: [{ component: 'Button', required: ['label'] }] };
  assert.equal((await checkJsx(workspace, query)).summary.status, 'pass');
  writeFileSync(path.join(workspace.root, 'App.tsx'), '<Button');
  const malformed = await checkJsx(workspace, query);
  assert.equal(malformed.summary.status, 'incomplete');
  assert.ok(malformed.unresolved.some((item) => item.reason.startsWith('Parse error:')));
});

for (const [name, rules] of [
  ['empty rule list', []],
  ['missing checks', [{ component: 'Button' }]],
  ['empty component', [{ component: '', required: ['label'] }]],
  ['empty prop name', [{ component: 'Button', required: [''] }]],
  ['unknown rule option', [{ component: 'Button', required: ['label'], typo: true }]],
  [
    'duplicate explicit ids',
    [
      { id: 'same', component: 'A', required: ['x'] },
      { id: 'same', component: 'B', forbidden: ['y'] },
    ],
  ],
]) {
  test(`audit rejects ${name}`, async (t) => {
    await assert.rejects(checkJsx(project(t, '<Button />'), { rules }), /Invalid JSX rules/);
  });
}

test('audit returns explicit rule, prop, and location details for uncertainty', async (t) => {
  const workspace = project(t, '<Button {...props} />');
  const result = await checkJsx(workspace, {
    rules: [{ id: 'migration', component: 'Button', required: ['label'] }],
  });
  assert.deepEqual(result.unresolved, [
    {
      filePath: path.join(workspace.root, 'App.tsx'),
      line: 2,
      column: 20,
      reason: 'migration: unknown spread may supply label (missing check)',
    },
  ]);
  assert.deepEqual(result.summary, { status: 'incomplete', findings: 0, unresolved: 1 });
});

test('audit deduplicates a repeated prop within a rule and assigns a stable default rule id', async (t) => {
  const result = await checkJsx(project(t, '<Button />'), {
    rules: [{ component: 'Button', required: ['label', 'label'] }],
  });
  assert.equal(result.total, 1);
  assert.equal(result.matches[0].ruleId, 'rule-1');
  assert.equal(result.matches[0].prop, 'label');
  assert.equal(result.matches[0].message, 'Button: missing prop label');
});

test('rules normalize whitespace and preserve distinct explicit and generated IDs', async (t) => {
  const rules = validateRules([
    { id: ' named ', component: ' Button ', required: [' label '] },
    { component: 'Button', forbidden: ['unsafe'] },
    { component: 'Button', deprecated: ['old'] },
  ]);
  assert.deepEqual(rules[0], { id: 'named', component: 'Button', required: ['label'] });
  const result = await checkJsx(project(t, '<Button unsafe old />'), { rules });
  assert.deepEqual(
    result.matches.map((item) => item.ruleId),
    ['named', 'rule-2', 'rule-3']
  );
  assert.throws(
    () =>
      validateRules([
        { id: 'rule-2', component: 'Button', required: ['label'] },
        { component: 'Button', forbidden: ['unsafe'] },
      ]),
    /rule IDs must be unique/
  );
  assert.throws(
    () => validateRules([{ component: 'Button', required: [] }]),
    /at least one prop check/
  );
});

test('audit labels unresolved imported definitions instead of claiming a complete result', async (t) => {
  const workspace = project(t, '<Button />');
  writeFileSync(
    path.join(workspace.root, 'App.tsx'),
    'import { Button } from "missing-package";\nconst App = () => <Button />;'
  );
  const result = await checkJsx(workspace, {
    rules: [{ id: 'migration', component: 'Button', required: ['label'] }],
  });
  assert.equal(result.summary.status, 'incomplete');
  assert.ok(
    result.unresolved.some(
      (item) =>
        item.reason === 'migration: cannot resolve component definition from missing-package'
    )
  );
  assert.ok(
    result.unresolved.every((item) => item.filePath === path.join(workspace.root, 'App.tsx'))
  );
});

test('MCP audit returns the same results and rejects invalid rules and page limits', async (t) => {
  const workspace = project(t, '<Button />');
  const server = new McpServer({ name: 'check-test', version: '1.0.0' });
  registerCheckJsxTool(server, workspace);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const handle = serveStdio(() => server, { transport: serverTransport, legacy: 'reject' });
  const client = new Client(
    { name: 'check-client', version: '1.0.0' },
    {
      versionNegotiation: { mode: { pin: '2026-07-28' } },
    }
  );
  t.after(async () => {
    await client.close();
    await handle.close();
  });
  await client.connect(clientTransport);
  const query = { rules: [{ component: 'Button', required: ['label'] }] };
  const result = await client.callTool({ name: 'check_jsx', arguments: query });
  assert.equal(result.isError, undefined);
  const expected = await checkJsx(workspace, query);
  assert.deepEqual(result.structuredContent, expected);
  assert.deepEqual(JSON.parse(result.content[0].text), expected);
  assert.equal(expected.limit, 100);
  const page = await client.callTool({
    name: 'check_jsx',
    arguments: { ...query, path: 'App.tsx', offset: 1, limit: 500 },
  });
  assert.equal(page.structuredContent.offset, 1);
  assert.equal(page.structuredContent.limit, 500);
  assert.equal(page.structuredContent.total, 1);
  assert.deepEqual(page.structuredContent.matches, []);
  const firstPage = await client.callTool({ name: 'check_jsx', arguments: { ...query, limit: 1 } });
  assert.equal(firstPage.isError, undefined);
  assert.equal(firstPage.structuredContent.limit, 1);
  assert.equal(firstPage.structuredContent.matches.length, 1);
  const twoRules = await client.callTool({
    name: 'check_jsx',
    arguments: {
      rules: [...query.rules, { component: 'Button', forbidden: ['unsafe'] }],
    },
  });
  assert.equal(twoRules.isError, undefined);
  for (const invalid of [{ ...query, limit: 501 }, { ...query, offset: -1 }, { rules: [] }]) {
    assert.equal((await client.callTool({ name: 'check_jsx', arguments: invalid })).isError, true);
  }
  const { tools } = await client.listTools();
  assert.equal(tools[0].name, 'check_jsx');
  assert.equal(tools[0].annotations.readOnlyHint, true);
  assert.equal(tools[0].annotations.destructiveHint, false);
  assert.ok(tools[0].title.length > 0);
  assert.ok(tools[0].description.length > 0);
});

test('MCP audit snippets include late call sites on long source lines', async (t) => {
  const workspace = project(t, `${' '.repeat(3900)}<Button /><Button old />`);
  const server = new McpServer({ name: 'check-test', version: '1.0.0' });
  registerCheckJsxTool(server, workspace);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const handle = serveStdio(() => server, { transport: serverTransport, legacy: 'reject' });
  const client = new Client(
    { name: 'check-client', version: '1.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } }
  );
  t.after(async () => {
    await client.close();
    await handle.close();
  });
  await client.connect(clientTransport);
  const response = await client.callTool({
    name: 'check_jsx',
    arguments: { rules: [{ component: 'Button', required: ['label'], forbidden: ['old'] }] },
  });
  const findings = response.structuredContent.matches;
  assert.deepEqual(
    findings.map(({ kind }) => kind),
    ['missing', 'missing', 'forbidden']
  );
  for (const finding of findings) {
    assert.match(finding.snippet, /<Button/);
  }
});
