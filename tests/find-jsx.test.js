import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { staticValue } from '../dist/jsx-query.js';
import { ProjectWorkspace } from '../dist/project.js';
import { findJsx, registerFindJsxTool } from '../dist/find-jsx.js';
import { McpServer, InMemoryTransport } from '@modelcontextprotocol/server';
import { Client } from '@modelcontextprotocol/client';
import { serveStdio } from '@modelcontextprotocol/server/stdio';

// Integration slice: real project filesystem → TypeScript bindings → search results.
// All participating modules and filesystem are real; there are no mocks.
function fixture(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'find-jsx-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [name, source] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), source);
  }
  return new ProjectWorkspace({ root });
}

const ui = 'export const Button = (props: any) => null; export default Button;';
const identities = [
  [
    'named alias',
    `import { Button as B } from './ui'; const x = <B title="hello" />;`,
    'Button',
    'B',
    'Button',
  ],
  [
    'namespace member',
    `import * as UI from './ui'; const x = <UI.Button title="hello" />;`,
    'Button',
    'UI.Button',
    'Button',
  ],
  [
    'default alias',
    `import Main from './ui'; const x = <Main title="hello" />;`,
    'default',
    'Main',
    'default',
  ],
  [
    'simple re-export',
    `import { Button as B } from './barrel'; const x = <B title="hello" />;`,
    'Button',
    'B',
    'Button',
  ],
];
for (const [label, source, component, local, exported] of identities) {
  test(`original import identity survives ${label}`, async (t) => {
    const project = fixture(t, {
      'ui.tsx': ui,
      'barrel.ts': "export { Button } from './ui';",
      'app.tsx': source,
    });
    const result = await findJsx(project, {
      component,
      source: './ui',
      prop: 'title',
      value: 'hello',
    });
    assert.equal(result.complete, true);
    assert.equal(result.total, 1);
    assert.equal(result.matches[0].component, local);
    assert.equal(result.matches[0].identity.exportName, exported);
    assert.deepEqual(result.matches[0].props.title, { status: 'known', value: 'hello' });
  });
}

test('source filtering excludes unrelated imports and shadowed bindings', async (t) => {
  const project = fixture(t, {
    'ui.tsx': ui,
    'other.tsx': ui,
    'app.tsx': `import { Button as B } from './ui';
import { Button } from './other';
const a = <B />;
const b = <Button />;
function inner(B: any) { return <B />; }`,
  });
  const result = await findJsx(project, { component: 'Button', source: './ui' });
  assert.deepEqual(
    result.matches.map(({ component, line }) => ({ component, line })),
    [{ component: 'B', line: 3 }]
  );
});

test('tsconfig paths resolve the same local component identity', async (t) => {
  const project = fixture(t, {
    'tsconfig.json': JSON.stringify({
      compilerOptions: { baseUrl: '.', paths: { '@ui': ['./ui'] } },
    }),
    'ui.tsx': ui,
    'app.tsx': `import { Button as B } from '@ui'; const a = <B />;`,
  });
  const result = await findJsx(project, { component: 'Button', source: './ui' });
  assert.equal(result.total, 1);
  assert.equal(result.complete, true);
});

test('known props include booleans, computed object spread keys, and children', async (t) => {
  const project = fixture(t, {
    'app.tsx': `const x = <Widget disabled {...{ ['title']: 'hello', count: 3 }}>hello</Widget>;`,
  });
  const result = await findJsx(project, { component: 'Widget' });
  assert.deepEqual(result.matches[0].props, {
    disabled: { status: 'known', value: true },
    title: { status: 'known', value: 'hello' },
    count: { status: 'known', value: 3 },
    children: { status: 'known', value: 'hello' },
  });
  assert.deepEqual(result.matches[0].unknownSpreads, []);
});

// Prop presence depends on literal keys, independently of whether values are known.
for (const [name, spread, props, unknownSpreads] of [
  [
    'dynamic queried value',
    '{label: compute()}',
    { label: { status: 'unknown', expression: 'compute()' } },
    [],
  ],
  [
    'dynamic sibling value',
    '{label: "Save", other: compute()}',
    {
      label: { status: 'known', value: 'Save' },
      other: { status: 'unknown', expression: 'compute()' },
    },
    [],
  ],
  ['shorthand property', '{label}', { label: { status: 'unknown', expression: 'label' } }, []],
  [
    'nested spread followed by a literal property',
    '{...rest, label: "Save"}',
    { label: { status: 'known', value: 'Save' } },
    ['rest'],
  ],
]) {
  test(`literal spread preserves proven presence with a ${name}`, async (t) => {
    const project = fixture(t, { 'app.tsx': `const x = <Button {...${spread}} />;` });
    const result = await findJsx(project, { component: 'Button', prop: 'label' });
    assert.equal(result.total, 1);
    assert.deepEqual(result.matches[0].props, props);
    assert.deepEqual(result.matches[0].unknownSpreads, unknownSpreads);
    assert.equal(result.complete, unknownSpreads.length === 0);
  });
}

test('nested literal spreads apply property overwrites in source order', async (t) => {
  const project = fixture(t, {
    'app.tsx': `const x = <Button label="outer" {...({label: "first", ...{label: "nested", count: 3}, label: "last"} as const)} />;`,
  });
  const result = await findJsx(project, { component: 'Button', prop: 'label', value: 'last' });
  assert.equal(result.total, 1);
  assert.equal(result.complete, true);
  assert.deepEqual(result.matches[0].props, {
    label: { status: 'known', value: 'last' },
    count: { status: 'known', value: 3 },
  });
});

test('nested unknown spreads preserve keys and invalidate values until overwritten', async (t) => {
  const project = fixture(t, {
    'app.tsx': 'const x = <Button label="outer" {...{before: 1, ...{...rest}, after: 2}} />;',
  });
  const result = await findJsx(project, { component: 'Button', prop: 'label' });
  assert.equal(result.total, 1);
  assert.equal(result.complete, false);
  assert.deepEqual(result.matches[0].props, {
    label: { status: 'unknown', expression: 'rest' },
    before: { status: 'unknown', expression: 'rest' },
    after: { status: 'known', value: 2 },
  });
  assert.deepEqual(result.matches[0].unknownSpreads, ['rest']);
});

test('unknown computed spread keys preserve presence while later properties restore values', async (t) => {
  const project = fixture(t, {
    'app.tsx': 'const x = <Button label="outer" {...{before: 1, [key]: 3, label: "last"}} />;',
  });
  const result = await findJsx(project, { component: 'Button', prop: 'before' });
  assert.equal(result.total, 1);
  assert.equal(result.complete, false);
  assert.deepEqual(result.matches[0].props, {
    label: { status: 'known', value: 'last' },
    before: { status: 'unknown', expression: '[key]: 3' },
  });
  assert.deepEqual(result.matches[0].unknownSpreads, ['[key]: 3']);
});

test('literal spread getters and methods prove own keys without executing application code', async (t) => {
  const project = fixture(t, {
    'app.tsx': `const x = <Button {...{get label() { throw new Error("executed getter"); }, constructor() { throw new Error("executed method"); }}} />;`,
  });
  const result = await findJsx(project, { component: 'Button', prop: 'label' });
  assert.equal(result.total, 1);
  assert.equal(result.complete, true);
  assert.deepEqual(result.matches[0].props, {
    label: { status: 'unknown', expression: 'get label() { throw new Error("executed getter"); }' },
    constructor: {
      status: 'unknown',
      expression: 'constructor() { throw new Error("executed method"); }',
    },
  });
});

test('prototype setter syntax does not hide sibling keys or create an own prop', async (t) => {
  const project = fixture(t, {
    'app.tsx': 'const x = <Button {...{label: "Save", __proto__: unknownPrototype}} />;',
  });
  const result = await findJsx(project, { component: 'Button', prop: 'label' });
  assert.equal(result.total, 1);
  assert.equal(result.complete, false);
  assert.deepEqual(result.matches[0].props, { label: { status: 'known', value: 'Save' } });
});

test('shorthand and computed prototype keys remain own props with unknown values', async (t) => {
  const project = fixture(t, {
    'app.tsx':
      'const x = <><Button {...{__proto__}} /><Button {...{["__proto__"]: compute()}} /></>;',
  });
  const result = await findJsx(project, { component: 'Button', prop: '__proto__' });
  assert.equal(result.total, 2);
  assert.equal(result.complete, true);
  assert.deepEqual(
    result.matches.map(({ props }) => props),
    [
      { ['__proto__']: { status: 'unknown', expression: '__proto__' } },
      { ['__proto__']: { status: 'unknown', expression: 'compute()' } },
    ]
  );
});

test('dynamic spreads preserve uncertainty and later explicit props restore known values', async (t) => {
  const project = fixture(t, {
    'app.tsx': `const x = <Widget title="before" {...rest} count={3} />;`,
  });
  const result = await findJsx(project, { prop: 'title', value: 'before' });
  assert.equal(result.total, 0);
  assert.equal(result.complete, false);
  assert.match(result.unresolved[0].reason, /spread/);
  const all = await findJsx(project, {});
  assert.equal(all.matches[0].props.title.status, 'unknown');
  assert.deepEqual(all.matches[0].props.count, { status: 'known', value: 3 });
  assert.deepEqual(all.matches[0].unknownSpreads, ['rest']);
});

test('dynamic expressions are unresolved when filtering a prop value', async (t) => {
  const project = fixture(t, { 'app.tsx': `const x = <Widget title={label} />;` });
  const result = await findJsx(project, { prop: 'title', value: 'hello' });
  assert.equal(result.total, 0);
  assert.equal(result.complete, false);
  assert.match(result.unresolved[0].reason, /title/);
});

test('prop filters require prop presence and compare primitive values', async (t) => {
  const project = fixture(t, {
    'app.tsx': `const x = <><Widget disabled /><Widget disabled={false} /><Widget /></>;`,
  });
  const result = await findJsx(project, { component: 'Widget', prop: 'disabled', value: 'true' });
  assert.equal(result.total, 1);
  assert.deepEqual(result.matches[0].props.disabled, { status: 'known', value: true });
  await assert.rejects(findJsx(project, { value: 'true' }), /value.*prop/);
});

test('malformed source is explicitly incomplete', async (t) => {
  const project = fixture(t, { 'app.tsx': `const x = <Widget title="hello";` });
  const result = await findJsx(project, {});
  assert.equal(result.complete, false);
  assert.match(result.unresolved[0].reason, /parse/i);
  assert.equal(result.unresolved[0].filePath, path.join(project.root, 'app.tsx'));
});

test('missing imports retain declared identity and report unresolved definitions', async (t) => {
  const project = fixture(t, {
    'app.tsx': `import { Button as B } from './missing'; const x = <B />;`,
  });
  const result = await findJsx(project, { component: 'Button', source: './missing' });
  assert.equal(result.total, 1);
  assert.equal(result.complete, false);
  assert.deepEqual(result.matches[0].identity, { exportName: 'Button', source: './missing' });
  assert.match(result.unresolved[0].reason, /resolve/);
});

test('search returns sorted locations, snippets, and the requested page', async (t) => {
  const project = fixture(t, {
    'z.tsx': 'const z = <Widget />;',
    'a.tsx': 'const a = <Widget />;\nconst b = <Widget />;',
  });
  const result = await findJsx(project, { offset: 1, limit: 1 });
  assert.equal(result.total, 3);
  assert.equal(result.nextOffset, 2);
  assert.equal(result.matches[0].filePath, path.join(project.root, 'a.tsx'));
  assert.equal(result.matches[0].line, 2);
  assert.equal(result.matches[0].column, 11);
  assert.equal(result.matches[0].snippet, 'const b = <Widget />;');
});

test('outside-root imports never contribute source or prop data', async (t) => {
  const outer = fs.mkdtempSync(path.join(os.tmpdir(), 'find-jsx-outside-'));
  t.after(() => fs.rmSync(outer, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(outer, 'secret.tsx'),
    'export const Button = () => <Widget secret="must-not-appear" />;'
  );
  const project = fixture(t, {
    'app.tsx': `import { Button } from '${path.join(outer, 'secret')}'; const x = <Button />;`,
  });
  const result = await findJsx(project, {});
  assert.equal(result.total, 1);
  assert.equal(result.complete, false);
  assert.equal(JSON.stringify(result).includes('must-not-appear'), false);
  assert.equal(result.matches[0].identity.definition, undefined);
});

test('empty projects return a complete empty page', async (t) => {
  const result = await findJsx(fixture(t, {}), {});
  assert.deepEqual(result.matches, []);
  assert.equal(result.total, 0);
  assert.equal(result.complete, true);
});

test('MCP search executes the same workspace query and validates paging inputs', async (t) => {
  const project = fixture(t, { 'app.tsx': 'const x = <Widget title="hello" />;' });
  const server = new McpServer({ name: 'find-jsx-test', version: '1.0.0' });
  registerFindJsxTool(server, project);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const handle = serveStdio(() => server, { transport: serverTransport, legacy: 'reject' });
  const client = new Client(
    { name: 'find-jsx-client', version: '1.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } }
  );
  t.after(async () => {
    await client.close();
    await handle.close();
  });
  await client.connect(clientTransport);
  const result = await client.callTool({
    name: 'find_jsx',
    arguments: { component: 'Widget', prop: 'title', value: 'hello' },
  });
  assert.equal(result.isError, undefined);
  const page = JSON.parse(result.content[0].text);
  assert.deepEqual(result.structuredContent, page);
  assert.equal(page.total, 1);
  assert.equal(page.matches[0].component, 'Widget');
  assert.equal(page.limit, 100);
  const { tools } = await client.listTools();
  const [tool] = tools;
  assert.equal(tool.name, 'find_jsx');
  assert.equal(tool.annotations.readOnlyHint, true);
  assert.equal(tool.annotations.destructiveHint, false);
  assert.ok(tool.title.length > 0);
  assert.ok(tool.description.length > 0);
  for (const field of ['path', 'component', 'source', 'prop', 'value'])
    assert.ok(tool.inputSchema.properties[field].description.length > 0);
  const later = await client.callTool({ name: 'find_jsx', arguments: { offset: 1, limit: 2 } });
  assert.equal(later.isError, undefined);
  assert.equal(JSON.parse(later.content[0].text).offset, 1);
  assert.equal(JSON.parse(later.content[0].text).limit, 2);
  const invalid = await client.callTool({ name: 'find_jsx', arguments: { limit: 501 } });
  assert.equal(invalid.isError, true);
});

// Unit contract: literal extraction is data-only; all other expressions remain unknown.
for (const [label, expression, expected] of [
  ['string', '"text"', 'text'],
  ['template literal', '`text`', 'text'],
  ['number', '3', 3],
  ['negative number', '-3', -3],
  ['positive number', '+3', 3],
  ['true', 'true', true],
  ['false', 'false', false],
  ['null', 'null', null],
  ['array', '[1, "two", false]', [1, 'two', false]],
  ['object', '({title: "text", 2: false})', { title: 'text', 2: false }],
  ['computed string key', '({["title"]: "text"})', { title: 'text' }],
  ['computed numeric key', '({[2]: "text"})', { 2: 'text' }],
  ['asserted value', '("text" as string)', 'text'],
  ['satisfies value', '("text" satisfies string)', 'text'],
  ['type assertion', '<string>"text"', 'text'],
]) {
  test(`literal extraction returns the ${label}`, () => {
    const source = ts.createSourceFile(
      'test.ts',
      `const value = ${expression};`,
      ts.ScriptTarget.Latest,
      true
    );
    const result = staticValue(source.statements[0].declarationList.declarations[0].initializer);
    assert.deepEqual(result, { status: 'known', value: expected });
  });
}
for (const expression of [
  'name',
  'call()',
  '[name]',
  '[1, name]',
  '({[true]: "text"})',
  '({title: name})',
  '({[name]: "text"})',
  '({title})',
  '({get title() { return "text"; }})',
  '!3',
  '1e999',
  '-1e999',
  '-count',
  '({#private: 1})',
  '({ __proto__: {} })',
]) {
  test(`nonliteral data remains unknown: ${expression}`, () => {
    const source = ts.createSourceFile(
      'test.ts',
      `const value = ${expression};`,
      ts.ScriptTarget.Latest,
      true
    );
    const result = staticValue(source.statements[0].declarationList.declarations[0].initializer);
    assert.deepEqual(result, { status: 'unknown', expression });
  });
}

test('literal spreads cannot change the returned object prototype', async (t) => {
  const project = fixture(t, {
    'app.tsx': `const x = <Widget {...{ ['__proto__']: 'literal', constructor: 'value' }} />;`,
  });
  const result = await findJsx(project, { prop: '__proto__' });
  assert.equal(result.total, 1);
  assert.deepEqual(result.matches[0].props.__proto__, { status: 'known', value: 'literal' });
  assert.deepEqual(result.matches[0].props.constructor, { status: 'known', value: 'value' });
});

test('nested child elements produce separate matches and an unknown children value', async (t) => {
  const project = fixture(t, { 'app.tsx': 'const x = <Widget><Nested /></Widget>;' });
  const result = await findJsx(project, {});
  assert.deepEqual(
    result.matches.map(({ component }) => component),
    ['Widget', 'Nested']
  );
  assert.deepEqual(result.matches[0].props.children, {
    status: 'unknown',
    expression: '<Nested />',
  });
  assert.deepEqual(result.matches[1].props, {});
});

test('single-line child text preserves surrounding spaces', async (t) => {
  const project = fixture(t, { 'app.tsx': 'const x = <Widget> hello </Widget>;' });
  const result = await findJsx(project, { prop: 'children', value: ' hello ' });
  assert.equal(result.total, 1);
});

for (const prop of ['constructor', 'toString', '__proto__']) {
  test(`inherited object keys do not count as JSX props: ${prop}`, async (t) => {
    const project = fixture(t, { 'app.tsx': 'const x = <Widget />;' });
    const result = await findJsx(project, { prop });
    assert.equal(result.total, 0);
    assert.equal(result.complete, true);
  });
}

test('comment-only children and formatting-only newlines do not create a children prop', async (t) => {
  const project = fixture(t, {
    'app.tsx': 'const x = <><Widget>{/* comment */}</Widget><Widget>\n   \n</Widget></>;',
  });
  const result = await findJsx(project, { prop: 'children' });
  assert.equal(result.total, 0);
  assert.equal(result.complete, true);
});

test('a file removed after discovery produces incomplete analysis', async (t) => {
  const project = fixture(t, { 'app.tsx': 'const x = <Widget />;' });
  // Coordinate an actual filesystem removal at the discovery/read boundary.
  class DisappearingFileWorkspace extends ProjectWorkspace {
    async discover(input) {
      const files = await super.discover(input);
      fs.unlinkSync(files[0]);
      return files;
    }
  }
  const result = await findJsx(new DisappearingFileWorkspace({ root: project.root }), {});
  assert.equal(result.total, 0);
  assert.equal(result.complete, false);
  assert.equal(result.unresolved[0].filePath, path.join(project.root, 'app.tsx'));
  assert.match(result.unresolved[0].reason, /read/i);
});

test('object values are explicitly unresolved for primitive value filters', async (t) => {
  const project = fixture(t, { 'app.tsx': 'const x = <Widget data={{title: "hello"}} />;' });
  const result = await findJsx(project, { prop: 'data', value: '[object Object]' });
  assert.equal(result.total, 0);
  assert.equal(result.complete, false);
  assert.match(result.unresolved[0].reason, /primitive/);
});

test('empty string and null remain searchable primitive values', async (t) => {
  const project = fixture(t, {
    'app.tsx': 'const x = <><Widget title="" /><Widget title={null} /></>;',
  });
  assert.equal((await findJsx(project, { prop: 'title', value: '' })).total, 1);
  assert.equal((await findJsx(project, { prop: 'title', value: 'null' })).total, 1);
});

test('a component filter excludes differently named local JSX components', async (t) => {
  const project = fixture(t, { 'app.tsx': 'const x = <Other />;' });
  assert.equal((await findJsx(project, { component: 'Widget' })).total, 0);
});

test('source filters exclude locally declared components without an import', async (t) => {
  const project = fixture(t, {
    'ui.tsx': ui,
    'app.tsx': 'const Button = () => null; const x = <Button />;',
  });
  assert.equal((await findJsx(project, { component: 'Button', source: './ui' })).total, 0);
});

test('renamed re-exports resolve their canonical definition name and file', async (t) => {
  const project = fixture(t, {
    'ui.tsx': 'export const Original = () => null;',
    'barrel.ts': "export { Original as Button } from './ui';",
    'app.tsx': "import { Button as B } from './barrel'; const x = <B />;",
  });
  const result = await findJsx(project, { component: 'Original', source: './ui' });
  assert.equal(result.total, 1);
  assert.deepEqual(result.matches[0].identity.definition, {
    filePath: path.join(project.root, 'ui.tsx'),
    name: 'Original',
  });
  assert.equal((await findJsx(project, { component: 'Button', source: './barrel.ts' })).total, 1);
});

test('canonical source filters follow filesystem casing through re-exports', async (t) => {
  const project = fixture(t, {
    'ui.tsx': ui,
    'barrel.ts': "export { Button } from './UI';",
    'app.tsx': "import { Button as B } from './barrel'; const x = <B />;",
  });
  const acceptsDifferentCase = fs.existsSync(path.join(project.root, 'UI.tsx'));
  const result = await findJsx(project, {
    path: 'app.tsx',
    component: 'Button',
    source: './ui',
  });
  assert.equal(result.total, acceptsDifferentCase ? 1 : 0);
  if (acceptsDifferentCase) {
    assert.equal(result.complete, true);
    assert.equal(result.matches[0].identity.definition.filePath, path.join(project.root, 'ui.tsx'));
  }
});

test('unresolvable source filters cannot equate two absent module paths', async (t) => {
  const project = fixture(t, {
    'ui.tsx': ui,
    'app.tsx': "import { Button } from './missing'; const x = <Button />;",
  });
  assert.equal((await findJsx(project, { source: './unrelated' })).total, 0);
  assert.equal((await findJsx(project, { source: './ui' })).total, 0);
});

test('JavaScript JSX files participate in import-aware queries', async (t) => {
  const project = fixture(t, {
    'ui.jsx': 'export const Button = () => null;',
    'app.jsx': "import { Button as B } from './ui'; const x = <B />;",
  });
  const result = await findJsx(project, { component: 'Button', source: './ui' });
  assert.equal(result.total, 1);
  assert.equal(result.complete, true);
});

test('parse diagnostics use one-based source locations beyond the first line', async (t) => {
  const project = fixture(t, { 'app.tsx': 'const valid = 1;\nconst x = <Widget title="hello";' });
  const result = await findJsx(project, {});
  assert.equal(result.unresolved[0].line, 2);
  assert.equal(result.unresolved[0].column, 32);
});

test('multiline child text follows JSX whitespace rules', async (t) => {
  const project = fixture(t, {
    'app.tsx': 'const x = <Widget>\r\n  hello\tthere\r\n\r\n  world\r\n</Widget>;',
  });
  const result = await findJsx(project, { prop: 'children' });
  assert.deepEqual(result.matches[0].props.children, {
    status: 'known',
    value: 'hello there world',
  });
});

test('literal expression children override a children attribute', async (t) => {
  const project = fixture(t, {
    'app.tsx': 'const x = <Widget children="attribute">{"body"}</Widget>;',
  });
  const result = await findJsx(project, { prop: 'children', value: 'body' });
  assert.equal(result.total, 1);
});

test('multiple children are represented without claiming one literal value', async (t) => {
  const project = fixture(t, { 'app.tsx': 'const x = <Widget>{"first"}{"second"}</Widget>;' });
  const result = await findJsx(project, {});
  assert.deepEqual(result.matches[0].props.children, {
    status: 'unknown',
    expression: '{"first"}{"second"}',
  });
});

for (const expression of ['null', 'true', '3', '"text"', '[1, 2]']) {
  test(`non-object JSX spreads remain explicit unknown cases: ${expression}`, async (t) => {
    const project = fixture(t, { 'app.tsx': `const x = <Widget {...${expression}} />;` });
    const result = await findJsx(project, {});
    assert.equal(result.complete, false);
    assert.deepEqual(result.matches[0].unknownSpreads, [expression]);
    assert.deepEqual(result.matches[0].props, {});
  });
}

test('invalid empty JSX attribute expressions remain unknown', async (t) => {
  const project = fixture(t, { 'app.tsx': 'const x = <Widget title={} />;' });
  const result = await findJsx(project, {});
  assert.deepEqual(result.matches[0].props.title, { status: 'unknown', expression: '{}' });
});

test('JSX entity text is not mislabeled as its raw encoded value', async (t) => {
  const project = fixture(t, {
    'app.tsx': 'const x = <Widget title="a &amp; b">a &amp; b</Widget>;',
  });
  const title = await findJsx(project, { prop: 'title', value: 'a &amp; b' });
  const children = await findJsx(project, { prop: 'children', value: 'a &amp; b' });
  assert.equal(title.total, 0);
  assert.equal(title.complete, false);
  assert.equal(children.total, 0);
  assert.equal(children.complete, false);
});

test('object prototype setter syntax is not invented as an own prop', async (t) => {
  const project = fixture(t, {
    'app.tsx': 'const x = <Widget {...{ __proto__: "not-an-own-property" }} />;',
  });
  const result = await findJsx(project, { prop: '__proto__' });
  assert.equal(result.total, 0);
  assert.equal(result.complete, false);
});

test('unresolved imports support a nonmatching component filter', async (t) => {
  const project = fixture(t, {
    'app.tsx': "import { Button as B } from './missing'; const x = <B />;",
  });
  assert.equal((await findJsx(project, { component: 'Other' })).total, 0);
});

test('namespace objects used directly are not assigned a member import identity', async (t) => {
  const project = fixture(t, {
    'ui.tsx': ui,
    'app.tsx': "import * as UI from './ui'; const x = <UI />;",
  });
  const result = await findJsx(project, {});
  assert.equal(result.matches[0].identity, null);
});

test('missing namespace members have a declared source but unresolved definition', async (t) => {
  const project = fixture(t, {
    'ui.tsx': ui,
    'app.tsx': "import * as UI from './ui'; const x = <UI.Missing />;",
  });
  const result = await findJsx(project, {});
  assert.deepEqual(result.matches[0].identity, { source: './ui', exportName: 'Missing' });
  assert.equal(result.complete, false);
});

test('multiline child text removes spaces at line endings', async (t) => {
  const project = fixture(t, { 'app.tsx': 'const x = <Widget>hello   \n  world   \n</Widget>;' });
  const result = await findJsx(project, { prop: 'children' });
  assert.deepEqual(result.matches[0].props.children, { status: 'known', value: 'hello world' });
});

test('malformed module specifiers produce incomplete analysis', async (t) => {
  const project = fixture(t, { 'app.tsx': 'import { Button } from 123; const x = <Button />;' });
  const result = await findJsx(project, {});
  assert.equal(result.complete, false);
  assert.deepEqual(result.unresolved, [
    {
      filePath: path.join(project.root, 'app.tsx'),
      line: 1,
      column: 24,
      reason: 'Invalid import specifier: expected a string literal.',
    },
  ]);
  assert.equal(result.matches[0].identity, null);
});

test('a literal inline space is a known children prop', async (t) => {
  const project = fixture(t, { 'app.tsx': 'const x = <Widget> </Widget>;' });
  const result = await findJsx(project, { prop: 'children', value: ' ' });
  assert.equal(result.total, 1);
});

test('intrinsic tags from mapped JSX types have no component import identity', async (t) => {
  const project = fixture(t, {
    'app.tsx':
      "declare namespace JSX {type IntrinsicElements = {[K in 'div']: {}}} const x = <div />;",
  });
  const result = await findJsx(project, {});
  assert.equal(result.total, 1);
  assert.equal(result.matches[0].component, 'div');
  assert.equal(result.matches[0].identity, null);
  assert.equal(result.complete, true);
});
