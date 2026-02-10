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
    description: `MCP server for analyzing JSX/React component props and usage patterns.

This server helps you understand, audit, and refactor React/JSX codebases by providing
tools to analyze component props, find prop usages, and ensure prop requirements.

Capabilities:
- Analyze component prop usage across files
- Find specific prop usages (e.g., all onClick handlers)
- Audit components for missing required props
- Get component API documentation
- Support TypeScript and JavaScript projects`},
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

// Register tools using server.tool() with detailed descriptions for LLM understanding
server.tool(
  'analyze_jsx_props',
  `Analyze JSX/React component prop usage across files and directories.

Use this tool when you need to:
- Understand what props a component accepts
- Find all components in a codebase and their props
- Analyze prop usage patterns in a project
- Get TypeScript interface information for components

EXAMPLES:
1. Analyze all components in src/components:
   { "path": "src/components", "includeTypes": true }

2. Find all props for Button component:
   { "path": "src", "componentName": "Button", "includeTypes": true }

3. Find all usages of onClick prop:
   { "path": ".", "propName": "onClick", "includeTypes": false }

4. Analyze specific file with type info:
   { "path": "src/App.tsx", "includeTypes": true }

Returns:
- Component names and their props
- Prop types (when includeTypes is true)
- File locations where components are defined`,
  {
    path: z.string().describe('Absolute or relative path to file or directory to analyze (e.g., "src/components" or "src/App.tsx")'),
    componentName: z.string().optional().describe('Filter: analyze only this specific component name (e.g., "Button")'),
    propName: z.string().optional().describe('Filter: search only for this specific prop name (e.g., "onClick")'),
    includeTypes: z.boolean().default(true).describe('Include TypeScript type information in results'),
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
  `Find all usages of a specific prop across JSX/React files.

Use this tool when you need to:
- Locate where a prop is used throughout the codebase
- Find all components that use a specific prop like "onClick", "className", etc.
- Audit prop usage for refactoring or deprecation
- Understand prop propagation patterns

EXAMPLES:
1. Find all onClick handlers in the project:
   { "propName": "onClick" }

2. Find className usage in components directory:
   { "propName": "className", "directory": "src/components" }

3. Find variant prop only on Button components:
   { "propName": "variant", "componentName": "Button" }

4. Find all disabled props in specific directory:
   { "propName": "disabled", "directory": "src/forms" }

Returns:
- List of component instances using the prop
- File paths and line numbers
- Values passed to the prop`,
  {
    propName: z.string().describe('Name of the prop to search for (e.g., "onClick", "className", "variant")'),
    directory: z.string().default('.').describe('Directory to search in (defaults to current directory)'),
    componentName: z.string().optional().describe('Filter: only search within this component name (e.g., "Button")'),
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
  `Get detailed information about all props used by a specific component.

Use this tool when you need to:
- Understand what props a component accepts and uses
- Document component APIs
- Check if a component has certain props before using it
- Analyze component interfaces

EXAMPLES:
1. Get all props for Button component:
   { "componentName": "Button" }

2. Check Modal component props in specific directory:
   { "componentName": "Modal", "directory": "src/components" }

3. Document Card component API:
   { "componentName": "Card", "directory": "src/ui" }

4. Analyze Input component interface:
   { "componentName": "Input" }

Returns:
- All props used by the component
- Prop types and default values
- Usage statistics across the codebase`,
  {
    componentName: z.string().describe('Name of the component to analyze (e.g., "Button", "Modal", "Card")'),
    directory: z.string().default('.').describe('Directory to search in (defaults to current directory)'),
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
  `Find component instances that are missing a required prop (e.g., Select components without width prop).

Use this tool when you need to:
- Audit components for missing required props
- Ensure accessibility props are present (e.g., missing aria-label)
- Check for missing styling props (e.g., missing width or height)
- Enforce prop requirements across the codebase
- Refactor components and ensure all usages are updated

EXAMPLES:
1. Find Select components missing width prop:
   { "componentName": "Select", "requiredProp": "width" }

2. Audit Image components for missing alt text:
   { "componentName": "Image", "requiredProp": "alt" }

3. Find Button components missing type prop:
   { "componentName": "Button", "requiredProp": "type", "directory": "src" }

4. Check Input components for missing label:
   { "componentName": "Input", "requiredProp": "aria-label", "directory": "src/forms" }

Returns:
- List of component instances missing the required prop
- File paths and line numbers
- Existing props on those instances
- Summary statistics (total instances vs missing count)`,
  {
    componentName: z.string().describe('Name of the component to check (e.g., "Select", "Button", "Image")'),
    requiredProp: z.string().describe('Name of the required prop that should be present (e.g., "width", "alt", "aria-label")'),
    directory: z.string().default('.').describe('Directory to search in (defaults to current directory)'),
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
JSX Prop Lookup MCP Server v3.1.0-beta.0

USAGE:
  npx jsx-prop-lookup-mcp-server [options]

OPTIONS:
  --help, -h              Show this help message
  --allowed-roots <paths> Comma-separated list of allowed filesystem roots
                          (env: ALLOWED_ROOTS)

MODE:
  This server runs in MCP (Model Context Protocol) mode and communicates
  via stdio. It provides tools for analyzing JSX/React component props.

AVAILABLE TOOLS:
  1. analyze_jsx_props
     Analyze JSX/React component prop usage across files and directories
     
     Parameters:
       - path (required): File or directory path to analyze
       - componentName (optional): Filter to specific component
       - propName (optional): Filter to specific prop
       - includeTypes (optional): Include TypeScript types (default: true)
     
     Examples:
       { "path": "src/components" }
       { "path": "src/App.tsx", "componentName": "Button" }
       { "path": ".", "propName": "onClick" }

  2. find_prop_usage
     Find all usages of a specific prop across JSX files
     
     Parameters:
       - propName (required): Name of the prop to search for
       - directory (optional): Directory to search (default: ".")
       - componentName (optional): Limit to specific component
     
     Examples:
       { "propName": "onClick" }
       { "propName": "className", "directory": "src/components" }
       { "propName": "variant", "componentName": "Button" }

  3. get_component_props
     Get detailed information about all props used by a specific component
     
     Parameters:
       - componentName (required): Name of the component to analyze
       - directory (optional): Directory to search (default: ".")
     
     Examples:
       { "componentName": "Button" }
       { "componentName": "Modal", "directory": "src/components" }

  4. find_components_without_prop
     Find component instances missing a required prop
     
     Parameters:
       - componentName (required): Name of the component to check
       - requiredProp (required): Name of the required prop
       - directory (optional): Directory to search (default: ".")
     
     Examples:
       { "componentName": "Select", "requiredProp": "width" }
       { "componentName": "Image", "requiredProp": "alt" }
       { "componentName": "Button", "requiredProp": "type", "directory": "src" }

SECURITY:
  Use --allowed-roots to restrict filesystem access to specific directories:
    npx jsx-prop-lookup-mcp-server --allowed-roots=/home/project/src,/home/project/lib
    
  Or set environment variable:
    ALLOWED_ROOTS=/home/project/src npx jsx-prop-lookup-mcp-server

MCP CONFIGURATION:
  Add to your MCP client settings (e.g., Claude Desktop, Cursor):
  
  {
    "mcpServers": {
      "jsx-prop-lookup": {
        "command": "npx",
        "args": ["jsx-prop-lookup-mcp-server@latest"],
        "env": {
          "ALLOWED_ROOTS": "/path/to/your/project"
        }
      }
    }
  }

For more information, visit: https://github.com/lmn451/jsx-prop-lookup-mcp-server
`);
};

// Check for help flag before starting server
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  showHelp();
  process.exit(0);
}

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
