#!/usr/bin/env node
import { parseCommandLine, executeCommand, renderHumanResult, cliError } from './cli.js';
import { PACKAGE_VERSION } from './version.js';

const HELP = `JSX Prop Lookup MCP Server v${PACKAGE_VERSION}

Usage: jsx-prop-lookup-mcp-server [query|inspect|check|serve] [options]
No command starts the MCP stdio server.

  query                   Find JSX call sites and prop values
  inspect --component X   Inspect declared component props and defaults
  check --rules FILE      Run a saved JSON rules document
  serve                   Serve find_jsx, inspect_component, check_jsx

  --project-root PATH     Overrides PROJECT_ROOT; defaults to the working directory
  --tsconfig FILE         Project-local TypeScript configuration
  --allowed-roots PATHS   Comma-separated roots; overrides ALLOWED_ROOTS
  --path PATH             Project-relative source file or directory
  --component NAME        Component name or import alias (query/inspect)
  --source MODULE         Import source filter (query/inspect)
  --remove-prop NAME      Preview affected callers for prop removal (inspect)
  --prop NAME             Prop filter (query)
  --value VALUE           Primitive value filter; requires --prop (query)
  --offset N              Non-negative page offset (default 0)
  --limit N               Page size from 1 to 500 (default 100)
  --json                  JSON result or error (query/inspect/check)
  --legacy-tools          Serve the four legacy tools (serve only)
  -h, --help              Show help
  --version               Show package version

Requires Node.js 20+ and MCP v2 (2026-07-28). Protocol uses stdout; logs use stderr.
`;

function fail(error: unknown): void {
  const result = cliError(error);
  if (process.argv.includes('--json')) console.log(JSON.stringify(result));
  else console.error(`Error: ${result.error.message}`);
  process.exitCode = result.exitCode;
}

async function main(): Promise<void> {
  if (Number(process.versions.node.split('.')[0]) < 20)
    throw new Error('Node.js 20 or higher is required');
  const options = parseCommandLine(process.argv.slice(2));
  if (options.action === 'help') {
    console.log(HELP);
    return;
  }
  if (options.action === 'version') {
    console.log(PACKAGE_VERSION);
    return;
  }
  if (options.command !== 'serve') {
    const { result, exitCode } = await executeCommand(options);
    console.log(options.json ? JSON.stringify(result) : renderHumanResult(result));
    process.exitCode = exitCode;
    return;
  }
  const { serveStdio } = await import('@modelcontextprotocol/server/stdio');
  const { createServer } = await import('./server.js');
  const server = createServer({ ...options.project, legacyTools: options.legacyTools });
  const handle = serveStdio(() => server, {
    legacy: 'reject',
    onerror: (error) => console.error('MCP server error:', error),
  });
  const shutdown = () => {
    void handle.close().catch(fail);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  console.error('JSX Prop Lookup MCP Server v2 running on stdio');
}

void main().catch(fail);
