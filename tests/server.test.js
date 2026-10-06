import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/client';
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
