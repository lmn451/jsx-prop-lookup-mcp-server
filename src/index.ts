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

// Helper function to create consistent responses
function createResponse(result: any, compact: boolean = false) {
  return {
    content: [
      {
        type: 'text',
        text: compact ? JSON.stringify(result) : JSON.stringify(result, null, 2),
      },
    ],
  };
}

function createErrorResponse(error: unknown) {
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
            format: {
              type: 'string',
              enum: ['full', 'compact', 'minimal'],
              description: 'Response format: full (default), compact (grouped by file), or minimal (props only)',
              default: 'full',
            },
            includeColumns: {
              type: 'boolean',
              description: 'Include column numbers in location data',
              default: true,
            },
            includePrettyPaths: {
              type: 'boolean',
              description: 'Include editor-compatible file paths for deep linking',
              default: false,
            },
          },
          required: ['path'],
        },
      },
      {
        name: 'query_components',
        description: 'Advanced component querying with prop value filtering and complex logic',
        inputSchema: {
          type: 'object',
          properties: {
            componentName: {
              type: 'string',
              description: 'Component type to search for (e.g., "Select", "Button")',
            },
            propCriteria: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: {
                    type: 'string',
                    description: 'Prop name',
                  },
                  value: {
                    type: ['string', 'number', 'boolean'],
                    description: 'Expected prop value',
                  },
                  operator: {
                    type: 'string',
                    enum: ['equals', 'contains'],
                    default: 'equals',
                    description: 'Comparison operator',
                  },
                  exists: {
                    type: 'boolean',
                    description: 'Whether prop must exist (true) or not exist (false)',
                  },
                },
                required: ['name'],
              },
              description: 'Array of prop criteria to match',
            },
            options: {
              type: 'object',
              properties: {
                directory: {
                  type: 'string',
                  description: 'Directory to search in',
                  default: '.',
                },
                logic: {
                  type: 'string',
                  enum: ['AND', 'OR'],
                  default: 'AND',
                  description: 'How to combine multiple criteria',
                },
                format: {
                  type: 'string',
                  enum: ['full', 'compact', 'minimal'],
                  default: 'full',
                  description: 'Response format',
                },
                includeColumns: {
                  type: 'boolean',
                  default: true,
                  description: 'Include column numbers in location data',
                },
                includePrettyPaths: {
                  type: 'boolean',
                  default: false,
                  description: 'Include editor-compatible file paths for deep linking',
                },
              },
            },
          },
          required: ['componentName', 'propCriteria'],
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
        const options = {
          format: (args.format as any) || 'full',
          includeColumns: args.includeColumns !== false,
          includePrettyPaths: args.includePrettyPaths === true,
        };
        const result = await analyzer.analyzeProps(
          args.path as string,
          {
            componentName: args.componentName as string | undefined,
            propName: args.propName as string | undefined,
            includeTypes: (args.includeTypes as boolean) ?? true,
            ...options
          }
        );
        const isCompact = options.format === 'compact' || options.format === 'minimal';
        return createResponse(result, isCompact);
      }

      case 'query_components': {
        const { componentName, propCriteria, options = {} } = args;
        
        const result = await analyzer.queryComponents(
          componentName as string,
          propCriteria as any[],
          options as any
        );
        
        const isCompact = (options as any)?.format === 'compact' || (options as any)?.format === 'minimal';
        return createResponse(result, isCompact);
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return createErrorResponse(error);
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