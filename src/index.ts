#!/usr/bin/env node

// Ensure we're using the correct Node.js version
const nodeMajorVersion = Number(process.versions.node.split('.')[0]);
if (Number.isNaN(nodeMajorVersion) || nodeMajorVersion < 18) {
  console.error("Error: Node.js 18 or higher is required");
  process.exit(1);
}

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { JSXPropAnalyzer } from "./jsx-analyzer.js";
import * as path from "path";
import * as fs from "fs";

const server = new Server({
  name: "jsx-prop-lookup-server",
  version: "1.0.0",
  capabilities: {
    tools: {},
  },
});

const analyzer = new JSXPropAnalyzer();

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "analyze_jsx_props",
        description: "Analyze JSX prop usage in files or directories",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "File or directory path to analyze",
            },
            componentName: {
              type: "string",
              description: "Optional: specific component name to analyze",
            },
            propName: {
              type: "string",
              description: "Optional: specific prop name to search for",
            },
            includeTypes: {
              type: "boolean",
              description: "Include TypeScript type information",
              default: true,
            },
          },
          required: ["path"],
        },
      },
      {
        name: "find_prop_usage",
        description: "Find all usages of a specific prop across JSX files",
        inputSchema: {
          type: "object",
          properties: {
            propName: {
              type: "string",
              description: "Name of the prop to search for",
            },
            directory: {
              type: "string",
              description: "Directory to search in",
              default: ".",
            },
            componentName: {
              type: "string",
              description: "Optional: limit search to specific component",
            },
          },
          required: ["propName"],
        },
      },
      {
        name: "get_component_props",
        description: "Get all props used by a specific component",
        inputSchema: {
          type: "object",
          properties: {
            componentName: {
              type: "string",
              description: "Name of the component to analyze",
            },
            directory: {
              type: "string",
              description: "Directory to search in",
              default: ".",
            },
          },
          required: ["componentName"],
        },
      },
      {
        name: "find_components_without_prop",
        description:
          "Find component instances that are missing a required prop (e.g., Select components without width prop)",
        inputSchema: {
          type: "object",
          properties: {
            componentName: {
              type: "string",
              description: 'Name of the component to check (e.g., "Select")',
            },
            requiredProp: {
              type: "string",
              description: 'Name of the required prop (e.g., "width")',
            },
            directory: {
              type: "string",
              description: "Directory to search in",
              default: ".",
            },
          },
          required: ["componentName", "requiredProp"],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (!args) {
    throw new Error("Missing arguments");
  }

  const resolveAndValidatePath = (input: string, label: string): string => {
    if (typeof input !== "string" || input.length === 0) {
      throw new Error(`${label} must be a non-empty string`);
    }
    if (!path.isAbsolute(input)) {
      throw new Error(`${label} must be an absolute path. Received: ${input}`);
    }
    try {
      const stat = fs.statSync(input);
      if (!stat.isDirectory() && !stat.isFile()) {
        throw new Error(`${label} exists but is neither a file nor directory: ${input}`);
      }
    } catch (error) {
      throw new Error(
        `Invalid ${label}: ${input} - ${error instanceof Error ? error.message : String(error)}`
      );
    }
    return input;
  };

  try {
    switch (name) {
      case "analyze_jsx_props": {
        if (typeof (args as any).path !== "string" || !(args as any).path) {
          throw new Error("Missing required argument: path");
        }
        const absPath = resolveAndValidatePath((args as any).path, "path");
        const result = await analyzer.analyzeProps(
          absPath,
          (args as any).componentName as string | undefined,
          (args as any).propName as string | undefined,
          ((args as any).includeTypes as boolean) ?? true
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "find_prop_usage": {
        if (
          typeof (args as any).propName !== "string" || !(args as any).propName
        ) {
          throw new Error("Missing required argument: propName");
        }
        const dir = ((args as any).directory as string) ?? ".";
        const absDir = resolveAndValidatePath(dir, "directory");
        const result = await analyzer.findPropUsage(
          (args as any).propName as string,
          absDir,
          (args as any).componentName as string | undefined
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "get_component_props": {
        if (
          typeof (args as any).componentName !== "string" ||
          !(args as any).componentName
        ) {
          throw new Error("Missing required argument: componentName");
        }
        const dir = ((args as any).directory as string) ?? ".";
        const absDir = resolveAndValidatePath(dir, "directory");
        const result = await analyzer.getComponentProps(
          (args as any).componentName as string,
          absDir
        );
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      }

      case "find_components_without_prop": {
        const componentName = (args as any).componentName as string;
        const requiredProp = (args as any).requiredProp as string;
        if (!componentName) {
          throw new Error("Missing required argument: componentName");
        }
        if (!requiredProp) {
          throw new Error("Missing required argument: requiredProp");
        }
        const dir = ((args as any).directory as string) ?? ".";
        const absDir = resolveAndValidatePath(dir, "directory");
        const result = await analyzer.findComponentsWithoutProp(
          componentName,
          requiredProp,
          absDir
        );
        return {
          content: [
            {
              type: "text",
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
          type: "text",
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
    console.error("JSX Prop Lookup MCP Server running on stdio");
  } catch (error) {
    console.error("Failed to start MCP server:", error);
    process.exit(1);
  }
}

// Handle process signals gracefully
process.on("SIGINT", () => {
  console.error("Received SIGINT, shutting down gracefully...");
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.error("Received SIGTERM, shutting down gracefully...");
  process.exit(0);
});

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
