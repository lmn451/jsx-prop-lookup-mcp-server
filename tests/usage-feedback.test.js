import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { register } from 'tsx/esm/api';
register();
const { ProjectWorkspace } = await import('../src/project.ts');
const { checkJsx } = await import('../src/check-jsx.ts');
function fixture(t, files) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'jsx-feedback-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [name, text] of Object.entries(files)) writeFileSync(path.join(root, name), text);
  return new ProjectWorkspace({ root });
}
test('built-in audit finds undeclared props and suggests declared spelling', async (t) => {
  const project = fixture(t, {
    'App.tsx': `const Button = (props: {dataTestId?: string; label: string}) => null;
const view = <><Button label="ok" data-testid="x" typo /><Button label="ok" key="k" /></>;`,
  });
  const result = await checkJsx(project, { undeclared: true });
  assert.equal(result.complete, true);
  assert.equal(result.total, 2);
  assert.equal(result.summary.status, 'fail');
  assert.equal(result.matches[0].kind, 'undeclared');
  assert.equal(result.matches[0].suggestion, 'dataTestId');
  assert.equal(result.matches[0].elementId, `${result.matches[0].filePath}:2:16`);
});
test('jsconfig aliases and renamed barrel exports preserve contracts', async (t) => {
  const project = fixture(t, {
    'jsconfig.json': JSON.stringify({
      compilerOptions: { baseUrl: '.', paths: { '@ui/*': ['./*'] } },
    }),
    'Button.jsx': 'export const Button = ({label}) => null;',
    'barrel.js': 'export {Button as Action} from "./Button";',
    'App.jsx': 'import {Action} from "@ui/barrel"; const view = <Action label="ok" typo />;',
  });
  const result = await checkJsx(project, { undeclared: true, path: 'App.jsx' });
  assert.equal(result.complete, true, JSON.stringify(result.unresolved));
  assert.deepEqual(
    result.matches.map((x) => x.prop),
    ['typo']
  );
});
test('rest forwarding to DOM is distinguished from discarded rest', async (t) => {
  const project = fixture(t, {
    'App.jsx': `const Forward = ({label, ...rest}) => <div {...rest}>{label}</div>;
const Drop = ({label, ...rest}) => <div>{label}</div>;
const view = <><Forward data-testid="a" /><Drop data-testid="b" /></>;`,
  });
  const result = await checkJsx(project, { undeclared: true });
  assert.equal(result.complete, true, JSON.stringify(result.unresolved));
  assert.equal(result.total, 1);
  assert.equal(result.matches[0].component, 'Drop');
  assert.equal(result.matches[0].forwarding, 'discarded');
});
test('unknown contracts and spreads stay incomplete, index signatures stay open', async (t) => {
  const project = fixture(t, {
    'App.tsx': `import {Missing} from './missing';
const Open = (props: {[key: string]: unknown}) => null;
const Closed = (props: {label?: string}) => null;
const view = <><Missing typo /><Open arbitrary /><Closed {...dynamic} /></>;`,
  });
  const result = await checkJsx(project, { undeclared: true });
  assert.equal(result.total, 0);
  assert.equal(result.complete, false);
  assert.ok(result.unresolved.some((x) => /contract/i.test(x.reason)));
  assert.ok(result.unresolved.some((x) => /spread/i.test(x.reason)));
});
test('summary and selected fields retain full audit totals and certainty', async (t) => {
  const project = fixture(t, {
    'App.tsx': 'const C = (props: {}) => null; const view = <C typo />;',
  });
  const summary = await checkJsx(project, { undeclared: true, summaryOnly: true });
  assert.equal(summary.total, 1);
  assert.deepEqual(summary.matches, []);
  assert.equal(summary.summary.status, 'fail');
  const selected = await checkJsx(project, { undeclared: true, fields: ['elementId', 'prop'] });
  assert.deepEqual(Object.keys(selected.matches[0]).sort(), ['elementId', 'prop']);
});

test('typed styled and forwardRef wrappers expose their inferred callable contracts', async (t) => {
  const project = fixture(t, {
    'App.tsx': `
declare const styled: { div: (strings: any) => (props: {tone?: string}) => null };
declare function forwardRef<P>(render: (props: P, ref: number) => null): (props: P & {ref?: number}) => null;
const Surface = styled.div\`\`;
const Input = forwardRef((props: {label: string}, ref) => null);
const view = <><Surface tone="ok" typo /><Input label="ok" ref={1} typo /></>;`,
  });
  const result = await checkJsx(project, { undeclared: true });
  assert.equal(result.complete, true, JSON.stringify(result.unresolved));
  assert.deepEqual(
    result.matches.map((x) => [x.component, x.prop]),
    [
      ['Surface', 'typo'],
      ['Input', 'typo'],
    ]
  );
  const { inspectComponent } = await import('../src/inspect-component.ts');
  for (const [component, prop] of [
    ['Surface', 'tone'],
    ['Input', 'label'],
  ]) {
    const inspected = await inspectComponent(project, { component });
    assert.equal(inspected.complete, true, JSON.stringify(inspected.unresolved));
    assert.ok(inspected.matches[0].props.some((x) => x.name === prop));
  }
});

test('missing interface bases cannot produce a false complete audit', async (t) => {
  const project = fixture(t, {
    'App.tsx':
      'interface Props extends Missing { label: string }; const C = (props: Props) => null; const view = <C label="ok" typo />;',
  });
  const result = await checkJsx(project, { undeclared: true });
  assert.equal(result.complete, false);
  assert.equal(result.total, 0);
});
test('CLI runs the built-in audit alone and alongside saved rules', async (t) => {
  const project = fixture(t, {
    'App.tsx': 'const C = (props: {label?: string}) => null; const view = <C typo />;',
    'rules.json': JSON.stringify({ version: 1, rules: [{ component: 'C', required: ['label'] }] }),
  });
  const { parseCommandLine, executeCommand, renderHumanResult } = await import('../src/cli.ts');
  const run = async (flags) =>
    executeCommand(parseCommandLine(['check', '--project-root', project.root, ...flags]));
  const summary = await run(['--undeclared', '--summary-only']);
  assert.equal(summary.exitCode, 1);
  assert.equal(summary.result.total, 1);
  assert.match(renderHumanResult(summary.result), /1 matches; 0 unresolved; complete/);
  const combined = await run(['--undeclared', '--rules', 'rules.json', '--fields', 'prop,kind']);
  assert.equal(combined.exitCode, 1);
  assert.equal(combined.result.total, 2);
  assert.deepEqual(
    combined.result.matches.map((x) => x.kind),
    ['undeclared', 'missing']
  );
  assert.doesNotThrow(() => renderHumanResult(combined.result));
});
test('summary mode never turns uncertainty into a pass', async (t) => {
  const project = fixture(t, {
    'App.tsx': 'const C = (props: any) => null; const view = <C typo />;',
  });
  const result = await checkJsx(project, { undeclared: true, summaryOnly: true });
  assert.equal(result.complete, false);
  assert.equal(result.summary.status, 'incomplete');
  assert.equal(result.unresolvedCount, 1);
  assert.deepEqual(result.unresolved, []);
});
test('MCP exposes built-in audits and compact outputs without rules', async (t) => {
  const project = fixture(t, {
    'App.tsx': 'const C = (props: {}) => null; const view = <C typo />;',
  });
  const { McpServer, InMemoryTransport } = await import('@modelcontextprotocol/server');
  const { Client } = await import('@modelcontextprotocol/client');
  const { serveStdio } = await import('@modelcontextprotocol/server/stdio');
  const { registerCheckJsxTool } = await import('../src/check-jsx.ts');
  const server = new McpServer({ name: 'usage-feedback', version: '1.0.0' });
  registerCheckJsxTool(server, project);
  const [transport, serverTransport] = InMemoryTransport.createLinkedPair();
  const handle = serveStdio(() => server, { transport: serverTransport, legacy: 'reject' });
  const client = new Client(
    { name: 'usage-feedback', version: '1.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } }
  );
  t.after(async () => {
    await client.close();
    await handle.close();
  });
  await client.connect(transport);
  for (const compact of [{ summaryOnly: true }, { fields: ['prop', 'elementId'] }]) {
    const query = { undeclared: true, ...compact };
    const result = await client.callTool({ name: 'check_jsx', arguments: query });
    assert.equal(result.isError, undefined);
    assert.deepEqual(result.structuredContent, await checkJsx(project, query));
  }
});

test('findings on one element share an ID across rules and pages', async (t) => {
  const project = fixture(t, {
    'App.tsx': 'const C = (props: {}) => null; const view = <C typo />;',
  });
  const query = { undeclared: true, rules: [{ component: 'C', forbidden: ['typo'] }] };
  const first = await checkJsx(project, { ...query, limit: 1 });
  const second = await checkJsx(project, { ...query, limit: 1, offset: 1 });
  assert.equal(first.total, 2);
  assert.equal(first.matches[0].elementId, second.matches[0].elementId);
});
test('compact output also applies to query, inspection and removal previews', async (t) => {
  const project = fixture(t, {
    'App.tsx': 'const C = (props: {label?: string}) => null; const view = <C label="x" />;',
  });
  const { findJsx } = await import('../src/find-jsx.ts');
  const { inspectComponent } = await import('../src/inspect-component.ts');
  for (const result of [
    await findJsx(project, { summaryOnly: true }),
    await inspectComponent(project, { component: 'C', summaryOnly: true }),
    await inspectComponent(project, { component: 'C', removeProp: 'label', summaryOnly: true }),
  ]) {
    assert.equal(result.total, 1);
    assert.equal(result.complete, true);
    assert.equal(result.unresolvedCount, 0);
    assert.deepEqual(result.matches, []);
  }
  const selected = await inspectComponent(project, { component: 'C', fields: ['name'] });
  assert.deepEqual(selected.matches, [{ name: 'C' }]);
});
test('tsconfig takes precedence over jsconfig, and explicit jsconfig is supported', async (t) => {
  const project = fixture(t, {
    'tsconfig.json': JSON.stringify({ include: ['Selected.tsx'] }),
    'jsconfig.json': JSON.stringify({ include: ['Other.jsx'], compilerOptions: { allowJs: true } }),
    'Selected.tsx': 'export const C = () => null;',
    'Other.jsx': 'export const D = () => null;',
  });
  assert.deepEqual(
    (await project.discover()).map((x) => path.basename(x)),
    ['Selected.tsx']
  );
  const explicit = new ProjectWorkspace({ root: project.root, tsconfig: 'jsconfig.json' });
  assert.deepEqual(
    (await explicit.discover()).map((x) => path.basename(x)),
    ['Other.jsx']
  );
});
