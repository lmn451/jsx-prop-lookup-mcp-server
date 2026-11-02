import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { McpServer, WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/server';
import { ProjectWorkspace } from '../dist/project.js';
import { registerInspectComponentTool } from '../dist/inspect-component.js';

test('inspect_component exposes structured results and rejects invalid arguments over MCP', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-inspect-mcp-'));
  fs.writeFileSync(
    path.join(root, 'widget.tsx'),
    'export function Widget(props: { title: string }) { return null; }'
  );
  const server = new McpServer({ name: 'inspect-test', version: '1.0.0' });
  registerInspectComponentTool(server, new ProjectWorkspace({ root }));
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
    sessionIdGenerator: () => 'inspect-session',
  });
  await server.connect(transport);
  const client = new Client({ name: 'inspect-tests', version: '1.0.0' });
  t.after(async () => {
    await client.close();
    await server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  await client.connect(
    new StreamableHTTPClientTransport(new URL('http://localhost/mcp'), {
      fetch: (input, init) => transport.handleRequest(new Request(input, init)),
    })
  );
  const listing = await client.listTools();
  assert.equal(listing.tools[0].name, 'inspect_component');
  assert.equal(listing.tools[0].title, 'Inspect component');
  assert.match(listing.tools[0].description, /declared prop types/);
  assert.match(listing.tools[0].inputSchema.properties.component.description, /import alias/);
  assert.match(listing.tools[0].inputSchema.properties.path.description, /Project file/);
  assert.match(listing.tools[0].inputSchema.properties.source.description, /Import specifier/);
  assert.deepEqual(listing.tools[0].annotations, { readOnlyHint: true, destructiveHint: false });
  const result = await client.callTool({
    name: 'inspect_component',
    arguments: { component: 'Widget' },
  });
  assert.equal(result.isError, undefined);
  assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
  assert.equal(result.structuredContent.total, 1);
  assert.equal(result.structuredContent.limit, 100);
  assert.deepEqual(result.structuredContent.matches[0].props, [
    { name: 'title', type: 'string', required: true },
  ]);
  for (const limit of [1, 499, 500]) {
    const bounded = await client.callTool({
      name: 'inspect_component',
      arguments: { component: 'Widget', limit },
    });
    assert.equal(bounded.isError, undefined);
    assert.equal(bounded.structuredContent.limit, limit);
    assert.equal(bounded.structuredContent.matches.length, 1);
  }
  for (const args of [
    { component: '' },
    { component: 'Widget', limit: 501 },
    { component: 'Widget', limit: 0 },
    { component: 'Widget', offset: -1 },
  ]) {
    const invalid = await client.callTool({ name: 'inspect_component', arguments: args });
    assert.equal(invalid.isError, true);
  }
  const page = await client.callTool({
    name: 'inspect_component',
    arguments: { component: 'Widget', limit: 500, offset: 1 },
  });
  assert.equal(page.isError, undefined);
  assert.deepEqual(page.structuredContent.matches, []);
});
