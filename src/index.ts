#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import { JSXPropAnalyzer } from './jsx-analyzer.js';
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

async function toolResult(result: Promise<unknown>) {
  try {
    return { content: [{ type: 'text' as const, text: JSON.stringify(await result, null, 2) }] };
  } catch (error) {
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}

function fail(error: unknown): never {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

function main(): void {
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
  const analyzer = new JSXPropAnalyzer(allowedRoots);
  const server = new McpServer({ name: 'jsx-prop-lookup-server', version: PACKAGE_VERSION });
  const annotations = { readOnlyHint: true, destructiveHint: false };
  const directory = z.string().default('.').describe('Directory to search.');

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
      annotations,
    },
    ({ path, componentName, propName, includeTypes }) =>
      toolResult(analyzer.analyzeProps(path, componentName, propName, includeTypes))
  );

  server.registerTool(
    'find_prop_usage',
    {
      title: 'Find prop usage',
      description:
        'Find all usages of a named prop across JSX/React files. Returns component names, file locations, and values passed to the prop.',
      inputSchema: z.object({
        propName: z.string().describe('Name of the prop to search for.'),
        directory,
        componentName: z.string().optional().describe('Optional component name filter.'),
      }),
      annotations,
    },
    ({ propName, directory, componentName }) =>
      toolResult(analyzer.findPropUsage(propName, directory, componentName))
  );

  server.registerTool(
    'get_component_props',
    {
      title: 'Get component props',
      description:
        'Get detailed information about the props used by a named component, including locations and associated TypeScript prop interface names.',
      inputSchema: z.object({
        componentName: z.string().describe('Name of the component to analyze.'),
        directory,
      }),
      annotations,
    },
    ({ componentName, directory }) =>
      toolResult(analyzer.getComponentProps(componentName, directory))
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
        directory,
      }),
      annotations,
    },
    ({ componentName, requiredProp, directory }) =>
      toolResult(analyzer.findComponentsWithoutProp(componentName, requiredProp, directory))
  );

  const handle = serveStdio(() => server, {
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

try {
  main();
} catch (error) {
  fail(error);
}
