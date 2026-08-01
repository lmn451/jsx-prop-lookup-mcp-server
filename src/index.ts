#!/usr/bin/env node

// MCP v2 requires Node.js 20 or newer.
const nodeMajorVersion = Number(process.versions.node.split('.')[0]);
if (Number.isNaN(nodeMajorVersion) || nodeMajorVersion < 20) {
  console.error('Error: Node.js 20 or higher is required');
  process.exit(1);
}

import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio, type StdioServerHandle } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import { JSXPropAnalyzer } from './jsx-analyzer.js';
import * as path from 'path';
import * as fs from 'fs';
import { PACKAGE_VERSION } from './version.js';
// Tool argument interfaces are intentionally omitted — tool input validation is handled by `zod` schemas

const server = new McpServer({
  name: 'jsx-prop-lookup-server',
  version: PACKAGE_VERSION,
});

const analyzer = new JSXPropAnalyzer();

// Configuration: limit allowed filesystem roots via `ALLOWED_ROOTS` env var
// or a CLI flag `--allowed-roots`.
// Provide a comma-separated list of absolute or workspace-relative paths.
// When configured, requests for paths outside these roots will be rejected.
const parseCliArg = (name: string): string | undefined => {
  const argv = process.argv.slice(2);
  const prefix = `--${name}=`;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith(prefix)) return a.slice(prefix.length);
    if (a === `--${name}`) return argv[i + 1];
  }
  return undefined;
};

const cliAllowed = parseCliArg('allowed-roots');
const allowedRootsEnv = (cliAllowed ?? process.env.ALLOWED_ROOTS ?? '').toString();
const allowedRoots = allowedRootsEnv
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((p) => path.resolve(process.cwd(), p));

// Helper function for path validation
const resolveAndValidatePath = (input: string, label: string): string => {
  if (typeof input !== 'string' || input.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  const abs = path.isAbsolute(input) ? input : path.resolve(process.cwd(), input);
  try {
    const stat = fs.statSync(abs);
    if (!stat.isDirectory() && !stat.isFile()) {
      throw new Error(`${label} exists but is neither a file nor directory: ${abs}`);
    }
  } catch (error) {
    throw new Error(
      `Invalid ${label}: ${input} -> ${abs} - ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }

  // If allowedRoots is configured, ensure the target path is within one of them.
  if (allowedRoots.length > 0) {
    let realAbs: string;
    try {
      realAbs = fs.realpathSync(abs);
    } catch {
      // Fall back to the resolved absolute path when realpath is unavailable.
      realAbs = abs;
    }

    const isWithinAllowed = allowedRoots.some((root) => {
      try {
        const realRoot = fs.realpathSync(root);
        const rel = path.relative(realRoot, realAbs);
        return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
      } catch {
        return false;
      }
    });

    if (!isWithinAllowed) {
      throw new Error(`Access to path outside allowed roots: ${abs}`);
    }
  }
  return abs;
};

// Helper function to format tool responses with error handling
const formatToolResponse = (result: unknown, error?: Error) => {
  if (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }

  const text = (() => {
    try {
      return JSON.stringify(result as unknown, null, 2);
    } catch {
      return String(result);
    }
  })();

  return {
    content: [
      {
        type: 'text' as const,
        text,
      },
    ],
  };
};

// Register tools with the MCP v2 registerTool API.
server.registerTool(
  'analyze_jsx_props',
  {
    title: 'Analyze JSX props',
    description:
      'Analyze JSX/React component prop usage across JavaScript and TypeScript files. Returns component definitions, prop usages, source locations, readable values, and optional TypeScript prop interface names.',
    inputSchema: z.object({
      path: z
        .string()
        .default('.')
        .describe('Absolute or relative file or directory path to analyze.'),
      componentName: z
        .string()
        .optional()
        .describe('Optional component name filter, including a namespaced local name.'),
      propName: z.string().optional().describe('Optional prop name filter.'),
      includeTypes: z
        .boolean()
        .default(true)
        .describe('Include TypeScript interface and type-alias information.'),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  async ({ path, componentName, propName, includeTypes }) => {
    try {
      const absPath = resolveAndValidatePath(path, 'path');
      const result = await analyzer.analyzeProps(absPath, componentName, propName, includeTypes);
      return formatToolResponse(result);
    } catch (error) {
      return formatToolResponse(null, error instanceof Error ? error : new Error(String(error)));
    }
  }
);

server.registerTool(
  'find_prop_usage',
  {
    title: 'Find prop usage',
    description:
      'Find all usages of a named prop across JSX/React files. Returns component names, file locations, and values passed to the prop.',
    inputSchema: z.object({
      propName: z.string().describe('Name of the prop to search for.'),
      directory: z.string().default('.').describe('Directory to search.'),
      componentName: z.string().optional().describe('Optional component name filter.'),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  async ({ propName, directory, componentName }) => {
    try {
      const absDir = resolveAndValidatePath(directory, 'directory');
      const result = await analyzer.findPropUsage(propName, absDir, componentName);
      return formatToolResponse(result);
    } catch (error) {
      return formatToolResponse(null, error instanceof Error ? error : new Error(String(error)));
    }
  }
);

server.registerTool(
  'get_component_props',
  {
    title: 'Get component props',
    description:
      'Get detailed information about the props used by a named component, including locations and associated TypeScript prop interface names.',
    inputSchema: z.object({
      componentName: z.string().describe('Name of the component to analyze.'),
      directory: z.string().default('.').describe('Directory to search.'),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  async ({ componentName, directory }) => {
    try {
      const absDir = resolveAndValidatePath(directory, 'directory');
      const result = await analyzer.getComponentProps(componentName, absDir);
      return formatToolResponse(result);
    } catch (error) {
      return formatToolResponse(null, error instanceof Error ? error : new Error(String(error)));
    }
  }
);

server.registerTool(
  'find_components_without_prop',
  {
    title: 'Find missing required props',
    description:
      'Find instances of a named component that do not provide a required prop. JSX spread attributes are treated as potentially containing the required prop.',
    inputSchema: z.object({
      componentName: z.string().describe('Name of the component to check.'),
      requiredProp: z.string().describe('Name of the required prop.'),
      directory: z.string().default('.').describe('Directory to search.'),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  async ({ componentName, requiredProp, directory }) => {
    try {
      const absDir = resolveAndValidatePath(directory, 'directory');
      const result = await analyzer.findComponentsWithoutProp(componentName, requiredProp, absDir);
      return formatToolResponse(result);
    } catch (error) {
      return formatToolResponse(null, error instanceof Error ? error : new Error(String(error)));
    }
  }
);

// CLI Help text
const showHelp = () => {
  console.log(`
JSX Prop Lookup MCP Server v${PACKAGE_VERSION}

USAGE:
  npx jsx-prop-lookup-mcp-server [options]

REQUIREMENTS:
  Node.js 20 or newer
  MCP v2 clients using protocol/specification 2026-07-28

OPTIONS:
  --help, -h              Show this help message
  --allowed-roots <paths> Comma-separated filesystem roots to allow
                          (env: ALLOWED_ROOTS; CLI takes precedence)

TRANSPORT:
  stdio only. The server reads JSON-RPC messages from stdin and writes
  protocol responses to stdout. Operational logs go to stderr.

AVAILABLE TOOLS:
  analyze_jsx_props              Analyze JSX prop usage and component definitions
  find_prop_usage                Find usages of a named prop
  get_component_props            Inspect props used by a component
  find_components_without_prop   Find instances missing a required prop

SECURITY:
  Restrict filesystem access with:
    ALLOWED_ROOTS=/path/to/project npx --yes jsx-prop-lookup-mcp-server
  or:
    npx --yes jsx-prop-lookup-mcp-server --allowed-roots /path/to/project

For more information, visit:
https://github.com/lmn451/jsx-prop-lookup-mcp-server
`);
};

// Check for help flag before starting server
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  showHelp();
  process.exit(0);
}

let serverHandle: StdioServerHandle | undefined;

function main(): void {
  try {
    serverHandle = serveStdio(() => server, {
      legacy: 'reject',
      onerror: (error) => console.error('MCP server error:', error),
    });
    console.error('JSX Prop Lookup MCP Server v2 running on stdio');
  } catch (error) {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  }
}

// Handle process signals gracefully.
const shutdown = (signal: string): void => {
  console.error(`Received ${signal}, shutting down gracefully...`);
  if (!serverHandle) {
    process.exit(0);
  }
  void serverHandle.close().finally(() => process.exit(0));
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

main();
