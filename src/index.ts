#!/usr/bin/env node

// Ensure we're using the correct Node.js version
const nodeMajorVersion = Number(process.versions.node.split('.')[0]);
if (Number.isNaN(nodeMajorVersion) || nodeMajorVersion < 18) {
  console.error('Error: Node.js 18 or higher is required');
  process.exit(1);
}

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { JSXPropAnalyzer } from './jsx-analyzer.js';
import * as path from 'path';
import * as fs from 'fs';

// Tool argument interfaces are intentionally omitted — tool input validation is handled by `zod` schemas

const server = new McpServer(
  {
    name: 'jsx-prop-lookup-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

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
      `Invalid ${label}: ${input} -> ${abs} - ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // If allowedRoots is configured, ensure the target path is within one of them.
  if (allowedRoots.length > 0) {
    let realAbs: string;
    try {
      realAbs = fs.realpathSync(abs);
    } catch (err) {
      // If realpath fails, fall back to the resolved absolute path
      realAbs = abs;
    }

    const isWithinAllowed = allowedRoots.some((root) => {
      try {
        const realRoot = fs.realpathSync(root);
        const rel = path.relative(realRoot, realAbs);
        return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
      } catch (_e) {
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
    } catch (e) {
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

// Register tools using server.tool() with manual validation to bypass SDK issues
server.tool(
  'analyze_jsx_props',
  'Analyze JSX prop usage in files or directories',
  {
    path: z.string().describe('File or directory path to analyze'),
    componentName: z.string().optional().describe('Optional: specific component name to analyze'),
    propName: z.string().optional().describe('Optional: specific prop name to search for'),
    includeTypes: z.boolean().default(true).describe('Include TypeScript type information'),
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

server.tool(
  'find_prop_usage',
  'Find all usages of a specific prop across JSX files',
  {
    propName: z.string().describe('Name of the prop to search for'),
    directory: z.string().default('.').describe('Directory to search in'),
    componentName: z.string().optional().describe('Optional: limit search to specific component'),
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

server.tool(
  'get_component_props',
  'Get all props used by a specific component',
  {
    componentName: z.string().describe('Name of the component to analyze'),
    directory: z.string().default('.').describe('Directory to search in'),
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

server.tool(
  'find_components_without_prop',
  'Find component instances that are missing a required prop',
  {
    componentName: z.string().describe('Name of the component to check'),
    requiredProp: z.string().describe('Name of the required prop'),
    directory: z.string().default('.').describe('Directory to search in'),
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

async function main() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('JSX Prop Lookup MCP Server running on stdio');
  } catch (error) {
    console.error('Failed to start MCP server:', error);
    process.exit(1);
  }
}

// Handle process signals gracefully
process.on('SIGINT', () => {
  console.error('Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
