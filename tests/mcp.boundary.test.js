import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

const serverPath = fileURLToPath(new URL('../dist/index.js', import.meta.url));

async function fixtureClient(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-mcp-boundary-'));
  const file = path.join(directory, 'Widget.tsx');
  fs.writeFileSync(
    file,
    `interface WidgetProps { id: string }
    function Widget({id}: WidgetProps) { return <span>{id}</span>; }
    const view = <Widget id="ok" />;`
  );
  const client = new Client(
    { name: 'boundary-tests', version: '1.0.0' },
    {
      versionNegotiation: { mode: { pin: '2026-07-28' } },
    }
  );
  t.after(async () => {
    try {
      await client.close();
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [serverPath],
      cwd: directory,
      env: { ...process.env, ALLOWED_ROOTS: directory },
    })
  );
  const call = async (name, args) => {
    const result = await client.callTool({ name, arguments: args });
    assert.ok(!result.isError, result.content[0].text);
    return JSON.parse(result.content[0].text);
  };
  return { client, call, file };
}

test('all four tools default their search path to the server working directory', async (t) => {
  const { call } = await fixtureClient(t);
  const analysis = await call('analyze_jsx_props', {});
  assert.equal(analysis.summary.totalFiles, 1);
  assert.equal(analysis.components[0].propsInterface, 'WidgetProps');
  assert.equal((await call('find_prop_usage', { propName: 'id' })).length, 2);
  assert.equal((await call('get_component_props', { componentName: 'Widget' })).length, 1);
  const missing = await call('find_components_without_prop', {
    componentName: 'Widget',
    requiredProp: 'disabled',
  });
  assert.equal(missing.summary.missingPropCount, 1);
});

test('invalid argument types return tool errors and allow subsequent valid calls', async (t) => {
  const { client, call } = await fixtureClient(t);
  for (const request of [
    { name: 'analyze_jsx_props', arguments: { path: 123 } },
    { name: 'analyze_jsx_props', arguments: { includeTypes: 'false' } },
    { name: 'find_prop_usage', arguments: { propName: false } },
    { name: 'get_component_props', arguments: { componentName: [] } },
    {
      name: 'find_components_without_prop',
      arguments: { componentName: 'Widget', requiredProp: null },
    },
  ])
    assert.equal((await client.callTool(request)).isError, true, request.name);
  assert.equal(
    (await call('get_component_props', { componentName: 'Widget' }))[0].componentName,
    'Widget'
  );
});

test('includeTypes false omits type metadata without changing the prop matches', async (t) => {
  const { call } = await fixtureClient(t);
  const typed = await call('analyze_jsx_props', { componentName: 'Widget', propName: 'id' });
  const untyped = await call('analyze_jsx_props', {
    componentName: 'Widget',
    propName: 'id',
    includeTypes: false,
  });
  assert.equal(typed.components[0].propsInterface, 'WidgetProps');
  assert.equal(untyped.components[0].propsInterface, undefined);
  assert.deepEqual(untyped.propUsages, typed.propUsages);
});

test('concurrent requests retain their own filters and results', async (t) => {
  const { call } = await fixtureClient(t);
  const [ids, missing, components, absent] = await Promise.all([
    call('find_prop_usage', { propName: 'id', componentName: 'Widget' }),
    call('find_components_without_prop', { componentName: 'Widget', requiredProp: 'id' }),
    call('get_component_props', { componentName: 'Widget' }),
    call('find_prop_usage', { propName: 'doesNotExist' }),
  ]);
  assert.equal(ids.length, 2);
  assert.equal(missing.summary.missingPropCount, 0);
  assert.deepEqual(
    components[0].props.map((p) => p.propName),
    ['id']
  );
  assert.deepEqual(absent, []);
});

test('a parse failure can be repaired and retried on the same connection', async (t) => {
  const { client, call, file } = await fixtureClient(t);
  fs.writeFileSync(file, 'const broken = <Widget id={');
  const failed = await client.callTool({ name: 'analyze_jsx_props', arguments: {} });
  assert.equal(failed.isError, true);
  fs.writeFileSync(file, 'const repaired = <Widget id="repaired" />;');
  const result = await call('find_prop_usage', { propName: 'id' });
  assert.equal(result.length, 1);
  assert.equal(result[0].value, 'repaired');
});
