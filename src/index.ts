#!/usr/bin/env node

// Ensure we're using the correct Node.js version
if (process.version.split('.')[0].slice(1) < '18') {
  console.error('Error: Node.js 18 or higher is required');
  process.exit(1);
}

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { JSXPropAnalyzer } from './jsx-analyzer.js';

const server = new Server(
  {
    name: 'jsx-prop-lookup-server',
    version: '1.0.0',
    capabilities: {
      tools: {},
    },
  }
);

const analyzer = new JSXPropAnalyzer();

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'analyze_jsx_props',
        description: 'Analyze JSX prop usage in files or directories',
        inputSchema: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'File or directory path to analyze',
            },
            componentName: {
              type: 'string',
              description: 'Optional: specific component name to analyze',
            },
            propName: {
              type: 'string',
              description: 'Optional: specific prop name to search for',
            },
            includeTypes: {
              type: 'boolean',
              description: 'Include TypeScript type information',
              default: true,
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'find_prop_usage',
        description: 'Find all usages of a specific prop across JSX files',
        inputSchema: {
          type: 'object',
          properties: {
            propName: {
              type: 'string',
              description: 'Name of the prop to search for',
            },
            directory: {
              type: 'string',
              description: 'Directory to search in',
              default: '.',
            },
            componentName: {
              type: 'string',
              description: 'Optional: limit search to specific component',
            },
          },
          required: ['propName'],
        },
      },
      {
        name: 'get_component_props',
        description: 'Get all props used by a specific component',
        inputSchema: {
          type: 'object',
          properties: {
            componentName: {
              type: 'string',
              description: 'Name of the component to analyze',
            },
            directory: {
              type: 'string',
              description: 'Directory to search in',
              default: '.',
            },
          },
          required: ['componentName'],
        },
      },
      {
        name: 'find_components_without_prop',
        description: 'Find component instances that are missing a required prop (e.g., Select components without width prop)',
        inputSchema: {
          type: 'object',
          properties: {
            componentName: {
              type: 'string',
              description: 'Name of the component to check (e.g., "Select")',
            },
            requiredProp: {
              type: 'string',
              description: 'Name of the required prop (e.g., "width")',
            },
            directory: {
              type: 'string',
              description: 'Directory to search in',
              default: '.',
            },
          },
          required: ['componentName', 'requiredProp'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  if (!args) {
    throw new Error('Missing arguments');
  }

  try {
    switch (name) {
      case 'analyze_jsx_props': {
        const result = await analyzer.analyzeProps(
          args.path as string,
          args.componentName as string | undefined,
          args.propName as string | undefined,
          (args.includeTypes as boolean) ?? true
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'find_prop_usage': {
        const result = await analyzer.findPropUsage(
          args.propName as string,
          (args.directory as string) ?? '.',
          args.componentName as string | undefined
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'get_component_props': {
        const result = await analyzer.getComponentProps(
          args.componentName as string,
          (args.directory as string) ?? '.'
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case 'find_components_without_prop': {
        const result = await analyzer.findComponentsWithoutProp(
          args.componentName as string,
          args.requiredProp as string,
          (args.directory as string) ?? '.'
        );
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

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