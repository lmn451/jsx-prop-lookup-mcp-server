import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JSXPropAnalyzer } from '../dist/jsx-analyzer.js';
import { createServer } from '../dist/server.js';
import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';

function fixture(t, before, after) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-baseline-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const baseline = path.join(directory, 'baseline');
  const current = path.join(directory, 'current');
  for (const [root, source] of [
    [baseline, before],
    [current, after],
  ]) {
    fs.mkdirSync(root);
    fs.writeFileSync(path.join(root, 'Example.tsx'), source);
  }
  return { baseline, current, analyzer: new JSXPropAnalyzer() };
}

test('baseline comparison ignores line shifts and unchanged pre-existing evidence', async (t) => {
  const source =
    'const Button = ({label, ...rest}) => <button {...rest}>{label}</button>; const view = <Button ignored="old" />;';
  const { baseline, current, analyzer } = fixture(t, source, '\n\n' + source);
  const result = await analyzer.analyzeProps(current, undefined, undefined, true, baseline);
  assert.deepEqual(result.comparison, {
    baselinePath: baseline,
    addedPropUsages: [],
    removedPropUsages: [],
    addedComponents: [],
    removedComponents: [],
    changedComponents: [],
  });
  assert.equal((await analyzer.analyzeProps(current)).comparison, undefined);
});

test('baseline comparison detects lost consumption and forwarding with stable relative file identities', async (t) => {
  const { baseline, current, analyzer } = fixture(
    t,
    `function Button({'aria-label': label, ...rest}) { return <button {...rest} />; }`,
    'function Button({label}) { return <button />; }'
  );
  const { comparison } = await analyzer.analyzeProps(current, undefined, undefined, true, baseline);
  assert.deepEqual(
    comparison.removedPropUsages.filter((p) => !p.isSpread).map((p) => p.propName),
    ['aria-label']
  );
  assert.equal(comparison.changedComponents.length, 1);
  assert.equal(comparison.changedComponents[0].before.forwardedProps[0].targetComponent, 'button');
  assert.equal(comparison.changedComponents[0].after.forwardedProps, undefined);
  assert.deepEqual(comparison.addedComponents, []);
  assert.deepEqual(comparison.removedComponents, []);
});

test('baseline comparison preserves duplicate counts and distinguishes changed values', async (t) => {
  const { baseline, current, analyzer } = fixture(
    t,
    '<><Button title="same" /><Button title="same" /><Button width={10} /></>;',
    '<><Button title="same" /><Button width={20} /></>;'
  );
  const { comparison } = await analyzer.analyzeProps(current, undefined, undefined, true, baseline);
  assert.deepEqual(
    comparison.removedPropUsages.map((p) => [p.propName, p.value]),
    [
      ['title', 'same'],
      ['width', '10'],
    ]
  );
  assert.deepEqual(
    comparison.addedPropUsages.map((p) => [p.propName, p.value]),
    [['width', '20']]
  );
});

test('baseline reads obey allowed roots and fail on parse errors', async (t) => {
  const { baseline, current } = fixture(t, 'const bad = <', 'const view = <Button />;');
  await assert.rejects(
    new JSXPropAnalyzer([current]).analyzeProps(current, undefined, undefined, true, baseline),
    /outside allowed roots/
  );
  await assert.rejects(
    new JSXPropAnalyzer().analyzeProps(current, undefined, undefined, true, baseline),
    /Failed to parse/
  );
});

test('MCP exposes optional baselinePath and forwarding metadata without adding tools', async (t) => {
  const { baseline, current } = fixture(
    t,
    'const Button = ({label, ...rest}) => <button {...rest} />;',
    'const Button = ({label}) => <button />;'
  );
  const server = createServer([baseline, current]);
  const client = new Client({ name: 'baseline-test', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => {
    await client.close();
    await server.close();
  });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  assert.equal((await client.listTools()).tools.length, 4);
  const response = await client.callTool({
    name: 'analyze_jsx_props',
    arguments: { path: current, baselinePath: baseline },
  });
  assert.notEqual(response.isError, true);
  const result = JSON.parse(response.content[0].text);
  assert.equal(result.comparison.changedComponents.length, 1);
  assert.equal(result.comparison.changedComponents[0].before.forwardedProps[0].source, 'rest');
  const invalid = await client.callTool({
    name: 'analyze_jsx_props',
    arguments: { path: current, baselinePath: 123 },
  });
  assert.equal(invalid.isError, true);
});

test('baseline comparison reports added and removed definitions, including empty trees', async (t) => {
  const { baseline, current, analyzer } = fixture(
    t,
    'const Old = ({title}) => <span />;',
    'const New = ({label}) => <span />;'
  );
  const { comparison } = await analyzer.analyzeProps(current, undefined, undefined, true, baseline);
  assert.deepEqual(
    comparison.addedComponents.map((p) => p.componentName),
    ['New']
  );
  assert.deepEqual(
    comparison.removedComponents.map((p) => p.componentName),
    ['Old']
  );
  assert.deepEqual(comparison.changedComponents, []);
  fs.unlinkSync(path.join(current, 'Example.tsx'));
  const empty = await analyzer.analyzeProps(current, undefined, undefined, true, baseline);
  assert.equal(empty.comparison.removedComponents.length, 1);
  assert.deepEqual(empty.comparison.addedPropUsages, []);
});
test('baseline file comparisons apply component, prop and type filters to both sides', async (t) => {
  const { baseline, current, analyzer } = fixture(
    t,
    'interface ButtonProps {title: string} const Button = ({title, width}) => <button />; const Other = ({id}) => <div />;',
    'interface ButtonProps {title: string} const Button = ({title, height}) => <button />; const Other = ({name}) => <div />;'
  );
  const result = await analyzer.analyzeProps(
    path.join(current, 'Example.tsx'),
    'Button',
    'title',
    false,
    path.join(baseline, 'Example.tsx')
  );
  assert.equal(result.propUsages.length, 1);
  assert.equal(result.components[0].propsInterface, undefined);
  assert.deepEqual(result.comparison.changedComponents, []);
  assert.deepEqual(result.comparison.addedPropUsages, []);
  assert.deepEqual(result.comparison.removedPropUsages, []);
});
test('baseline comparison notices forwarding target and exclusion changes', async (t) => {
  const { baseline, current, analyzer } = fixture(
    t,
    'const Button = ({label, ...rest}) => <Old {...rest} />;',
    'const Button = ({label, disabled, ...rest}) => <New {...rest} />;'
  );
  const { comparison } = await analyzer.analyzeProps(current, undefined, undefined, true, baseline);
  const [{ before, after }] = comparison.changedComponents;
  assert.equal(before.forwardedProps[0].targetComponent, 'Old');
  assert.equal(after.forwardedProps[0].targetComponent, 'New');
  assert.deepEqual(after.forwardedProps[0].excludedProps, ['label', 'disabled']);
});

test('baseline comparison retains spread expression identity', async (t) => {
  const { baseline, current, analyzer } = fixture(
    t,
    'const view = <Button {...original} />;',
    'const view = <Button {...replacement} />;'
  );
  const { comparison } = await analyzer.analyzeProps(current, undefined, undefined, true, baseline);
  assert.deepEqual(
    comparison.addedPropUsages.map((p) => [p.propName, p.value]),
    [['...spread', 'replacement']]
  );
  assert.deepEqual(
    comparison.removedPropUsages.map((p) => [p.propName, p.value]),
    [['...spread', 'original']]
  );
});
