#!/usr/bin/env node

import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(projectRoot, 'src/index.ts');

const client = new Client(
  { name: 'manual-error-test-client', version: '2.0.0' },
  { versionNegotiation: { mode: { pin: '2026-07-28' } } }
);
const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['--import=tsx', serverPath],
  cwd: projectRoot,
});

try {
  await client.connect(transport);
  const result = await client.callTool({
    name: 'analyze_jsx_props',
    arguments: { path: '/non/existent/path' },
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.isError) process.exitCode = 1;
} finally {
  await client.close();
}
