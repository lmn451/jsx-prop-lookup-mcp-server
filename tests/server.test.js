import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createServer } from '../dist/server.js';

test('importing and creating a server does not start the CLI or attach process listeners', () => {
  const serverUrl = new URL('../dist/server.js', import.meta.url).href;
  const result = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `
        import assert from 'node:assert/strict';
        const listeners = () => [
          process.listenerCount('SIGINT'),
          process.listenerCount('SIGTERM'),
          process.stdin.listenerCount('data'),
        ];
        const before = listeners();
        const { createServer } = await import(${JSON.stringify(serverUrl)});
        const server = createServer();
        assert.deepEqual(listeners(), before);
        await server.close();
        console.log('created');
      `,
    ],
    { encoding: 'utf8', timeout: 5000 }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'created\n');
  assert.equal(result.stderr, '');
});

test('server instances keep their allowed roots isolated', { timeout: 10000 }, async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-server-instances-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const roots = ['alpha', 'bravo'].map((name) => {
    const root = path.join(directory, name);
    fs.mkdirSync(root);
    fs.writeFileSync(path.join(root, 'Widget.tsx'), `const view = <Widget label="${name}" />;`);
    return root;
  });
  const clients = await Promise.all(
    roots.map(async (root) => {
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const handle = serveStdio(() => createServer([root]), {
        transport: serverTransport,
        legacy: 'reject',
      });
      const client = new Client(
        { name: 'server-factory-tests', version: '1.0.0' },
        { versionNegotiation: { mode: { pin: '2026-07-28' } } }
      );
      t.after(async () => {
        await client.close();
        await handle.close();
      });
      await client.connect(clientTransport);
      return client;
    })
  );

  await Promise.all(
    clients.map(async (client, index) => {
      const call = (directory) =>
        client.callTool({ name: 'find_prop_usage', arguments: { directory, propName: 'label' } });
      const denied = await call(roots[1 - index]);
      assert.equal(denied.isError, true);
      assert.match(denied.content[0].text, /outside allowed roots/);

      const allowed = await call(roots[index]);
      assert.ok(!allowed.isError, allowed.content[0].text);
      assert.deepEqual(
        JSON.parse(allowed.content[0].text).map(({ componentName, propName, value }) => ({
          componentName,
          propName,
          value,
        })),
        [{ componentName: 'Widget', propName: 'label', value: path.basename(roots[index]) }]
      );
    })
  );
});

test('modern server instances expose three tools and isolate every tool to their project', async (t) => {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-modern-server-')));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const roots = ['alpha', 'bravo'].map((name) => {
    const root = path.join(directory, name);
    fs.mkdirSync(root);
    fs.writeFileSync(
      path.join(root, 'Button.tsx'),
      `export function Button({label}: {label: string}) { return null; }\nconst view = <Button label="${name}" />;`
    );
    return root;
  });
  for (const [index, root] of roots.entries()) {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const handle = serveStdio(() => createServer({ root }), {
      transport: serverTransport,
      legacy: 'reject',
    });
    const client = new Client(
      { name: 'modern-server-factory-tests', version: '1.0.0' },
      { versionNegotiation: { mode: { pin: '2026-07-28' } } }
    );
    t.after(async () => {
      await client.close();
      await handle.close();
    });
    await client.connect(clientTransport);
    assert.deepEqual((await client.listTools()).tools.map((tool) => tool.name).sort(), [
      'check_jsx',
      'find_jsx',
      'inspect_component',
    ]);
    const query = await client.callTool({ name: 'find_jsx', arguments: { component: 'Button' } });
    assert.equal(query.isError, undefined);
    assert.deepEqual(
      JSON.parse(query.content[0].text).matches.map((match) => match.props.label.value),
      [path.basename(root)]
    );
    const inspect = await client.callTool({
      name: 'inspect_component',
      arguments: { component: 'Button' },
    });
    assert.equal(inspect.isError, undefined);
    assert.deepEqual(JSON.parse(inspect.content[0].text).matches[0].props, [
      { name: 'label', type: 'string', required: true },
    ]);
    const check = await client.callTool({
      name: 'check_jsx',
      arguments: { rules: [{ component: 'Button', forbidden: ['label'] }] },
    });
    assert.equal(check.isError, undefined);
    assert.equal(JSON.parse(check.content[0].text).summary.status, 'fail');
    for (const request of [
      { name: 'find_jsx', arguments: {} },
      { name: 'inspect_component', arguments: { component: 'Button' } },
      { name: 'check_jsx', arguments: { rules: [{ component: 'Button', required: ['label'] }] } },
    ]) {
      const denied = await client.callTool({
        ...request,
        arguments: { ...request.arguments, path: roots[1 - index] },
      });
      assert.equal(denied.isError, true);
      assert.match(denied.content[0].text, /outside project root/);
    }
  }
});

test('explicit legacy mode retains configured-root queries', async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-legacy-project-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'App.tsx'), 'const view = <Button label="legacy-root" />;');
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const handle = serveStdio(() => createServer({ root, legacyTools: true }), {
    transport: serverTransport,
    legacy: 'reject',
  });
  const client = new Client(
    { name: 'legacy-project-tests', version: '1.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } }
  );
  t.after(async () => {
    await client.close();
    await handle.close();
  });
  await client.connect(clientTransport);
  assert.deepEqual((await client.listTools()).tools.map((tool) => tool.name).sort(), [
    'analyze_jsx_props',
    'find_components_without_prop',
    'find_prop_usage',
    'get_component_props',
  ]);
  const query = await client.callTool({
    name: 'find_prop_usage',
    arguments: { propName: 'label' },
  });
  assert.equal(query.isError, undefined);
  assert.deepEqual(
    JSON.parse(query.content[0].text).map((match) => match.value),
    ['legacy-root']
  );
});

test('the default server factory has the modern inventory', async (t) => {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const handle = serveStdio(() => createServer(), { transport: serverTransport, legacy: 'reject' });
  const client = new Client(
    { name: 'default-factory-tests', version: '1.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } }
  );
  t.after(async () => {
    await client.close();
    await handle.close();
  });
  await client.connect(clientTransport);
  assert.deepEqual(client.getServerVersion(), {
    name: 'jsx-prop-lookup-server',
    version: JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
      .version,
  });
  assert.deepEqual((await client.listTools()).tools.map((tool) => tool.name).sort(), [
    'check_jsx',
    'find_jsx',
    'inspect_component',
  ]);
});

test('legacy factory options preserve unrestricted and allowed-root modes without a project', async (t) => {
  const parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-legacy-factory-')));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const root = path.join(parent, 'allowed');
  fs.mkdirSync(root);
  const inside = path.join(root, 'Inside.tsx');
  const outside = path.join(parent, 'Outside.tsx');
  fs.writeFileSync(inside, 'const view = <Button label="inside" />;');
  fs.writeFileSync(outside, 'const view = <Button label="outside" />;');
  for (const allowedRoots of [undefined, [root]]) {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const handle = serveStdio(() => createServer({ legacyTools: true, allowedRoots }), {
      transport: serverTransport,
      legacy: 'reject',
    });
    const client = new Client(
      { name: 'legacy-options-tests', version: '1.0.0' },
      { versionNegotiation: { mode: { pin: '2026-07-28' } } }
    );
    t.after(async () => {
      await client.close();
      await handle.close();
    });
    await client.connect(clientTransport);
    const query = (directory) =>
      client.callTool({ name: 'find_prop_usage', arguments: { propName: 'label', directory } });
    const permitted = await query(inside);
    assert.equal(permitted.isError, undefined);
    assert.deepEqual(
      JSON.parse(permitted.content[0].text).map((match) => match.value),
      ['inside']
    );
    const external = await query(outside);
    if (allowedRoots) {
      assert.equal(external.isError, true);
      assert.match(external.content[0].text, /outside allowed roots/);
    } else {
      assert.equal(external.isError, undefined);
      assert.deepEqual(
        JSON.parse(external.content[0].text).map((match) => match.value),
        ['outside']
      );
    }
  }
});

test('selecting a legacy tsconfig enables the working-directory project boundary', async (t) => {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-legacy-config-boundary-'))
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'App.tsx'), 'const view = <Button label="outside" />;');
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const handle = serveStdio(() => createServer({ legacyTools: true, tsconfig: 'query.json' }), {
    transport: serverTransport,
    legacy: 'reject',
  });
  const client = new Client(
    { name: 'legacy-config-boundary-tests', version: '1.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } }
  );
  t.after(async () => {
    await client.close();
    await handle.close();
  });
  await client.connect(clientTransport);
  const result = await client.callTool({
    name: 'find_prop_usage',
    arguments: { propName: 'label', directory: root },
  });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /outside project root/);
});

test('legacy mode honors a tsconfig with the working directory as its project root', async (t) => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-legacy-config-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'App.tsx'), 'const view = <Button label="excluded" />;');
  fs.writeFileSync(path.join(root, 'query.json'), '{"files":[]}');
  const client = new Client(
    { name: 'legacy-config-tests', version: '1.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } }
  );
  t.after(() => client.close());
  const env = { ...process.env };
  delete env.PROJECT_ROOT;
  delete env.ALLOWED_ROOTS;
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [
        fileURLToPath(new URL('../dist/index.js', import.meta.url)),
        '--legacy-tools',
        '--tsconfig',
        'query.json',
      ],
      cwd: root,
      env,
    })
  );
  const result = await client.callTool({
    name: 'find_prop_usage',
    arguments: { propName: 'label' },
  });
  assert.equal(result.isError, undefined);
  assert.deepEqual(JSON.parse(result.content[0].text), []);
});
