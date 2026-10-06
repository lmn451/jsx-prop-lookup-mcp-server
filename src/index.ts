#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { PACKAGE_VERSION } from './version.js';

const HELP = `JSX Prop Lookup MCP Server v${PACKAGE_VERSION}

Usage: jsx-prop-lookup-mcp-server [options]

  -h, --help               Show this help
  --allowed-roots <paths>  Comma-separated filesystem roots
                          Overrides ALLOWED_ROOTS; relative to the working directory

Requires Node.js 20+ and MCP v2 (2026-07-28). Uses stdio; logs go to stderr.
Tools: analyze_jsx_props, find_prop_usage, get_component_props,
       find_components_without_prop

Example: jsx-prop-lookup-mcp-server --allowed-roots /workspace/project
`;

function fail(error: unknown): never {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

async function main(): Promise<void> {
  if (Number(process.versions.node.split('.')[0]) < 20) {
    throw new Error('Node.js 20 or higher is required');
  }
  const { values } = parseArgs({
    options: {
      help: { type: 'boolean', short: 'h' },
      'allowed-roots': { type: 'string' },
    },
  });
  if (values.help) {
    console.log(HELP);
    return;
  }

  const allowedRoots = (values['allowed-roots'] ?? process.env.ALLOWED_ROOTS ?? '')
    .split(',')
    .map((root) => root.trim())
    .filter(Boolean);
  const { serveStdio } = await import('@modelcontextprotocol/server/stdio');
  const { createServer } = await import('./server.js');

  const handle = serveStdio(() => createServer(allowedRoots), {
    legacy: 'reject',
    onerror: (error) => console.error('MCP server error:', error),
  });
  const shutdown = () => {
    void handle.close().then(() => process.exit(0), fail);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  console.error('JSX Prop Lookup MCP Server v2 running on stdio');
}

void main().catch(fail);
