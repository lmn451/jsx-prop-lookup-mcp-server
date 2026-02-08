#!/usr/bin/env node

// Ensure we're using the correct Node.js version
const nodeMajorVersion = Number(process.versions.node.split('.')[0]);
if (Number.isNaN(nodeMajorVersion) || nodeMajorVersion < 18) {
  console.error("Error: Node.js 18 or higher is required");
  process.exit(1);
}

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { JSXPropAnalyzer } from "./jsx-analyzer.js";
import * as path from "path";
import * as fs from "fs";

// Tool argument interfaces
interface AnalyzeJSXPropsArgs {
  path: string;
  componentName?: string;
  propName?: string;
  includeTypes?: boolean;
}

interface FindPropUsageArgs {
  propName: string;
  directory?: string;
  componentName?: string;
}

interface GetComponentPropsArgs {
  componentName: string;
  directory?: string;
}

interface FindComponentsWithoutPropArgs {
  componentName: string;
  requiredProp: string;
  directory?: string;
}

const server = new McpServer(
  {
    name: "jsx-prop-lookup-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const analyzer = new JSXPropAnalyzer();

// Helper function for path validation
const resolveAndValidatePath = (input: string, label: string): string => {
  if (typeof input !== "string" || input.length === 0) {
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
  return abs;
};

// Define Zod schemas for tool inputs
const AnalyzeJSXPropsSchema = z.object({
  path: z.string().describe("File or directory path to analyze"),
  componentName: z.string().optional().describe("Optional: specific component name to analyze"),
  propName: z.string().optional().describe("Optional: specific prop name to search for"),
  includeTypes: z.boolean().default(true).describe("Include TypeScript type information"),
});

const FindPropUsageSchema = z.object({
  propName: z.string().describe("Name of the prop to search for"),
  directory: z.string().default(".").describe("Directory to search in"),
  componentName: z.string().optional().describe("Optional: limit search to specific component"),
});

const GetComponentPropsSchema = z.object({
  componentName: z.string().describe("Name of the component to analyze"),
  directory: z.string().default(".").describe("Directory to search in"),
});

const FindComponentsWithoutPropSchema = z.object({
  componentName: z.string().describe('Name of the component to check (e.g., "Select")'),
  requiredProp: z.string().describe('Name of the required prop (e.g., "width")'),
  directory: z.string().default(".").describe("Directory to search in"),
});

// Helper function to format tool responses with error handling
const formatToolResponse = (result: any, error?: Error) => {
  if (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
  
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
};

// Register tools using the new API
server.registerTool(
  "analyze_jsx_props",
  {
    title: "Analyze JSX Props",
    description: "Analyze JSX prop usage in files or directories",
  },
  async (extra) => {
    try {
      // For now, we can't access arguments due to MCP SDK issue #1026
      throw new Error("Missing required argument: path");
    } catch (error) {
      return formatToolResponse(null, error as Error);
    }
  }
);

server.registerTool(
  "get_component_props",
  {
    title: "Get Component Props",
    description: "Get all props used by a specific component",
  },
  async (extra) => {
    try {
      // For now, we can't access arguments due to MCP SDK issue #1026
      throw new Error("Missing required argument: componentName");
    } catch (error) {
      return formatToolResponse(null, error as Error);
    }
  }
);

server.registerTool(
  "find_components_without_prop",
  {
    title: "Find Components Without Prop",
    description: "Find component instances that are missing a required prop (e.g., Select components without width prop)",
  },
  async (extra) => {
    try {
      // For now, we can't access arguments due to MCP SDK issue #1026
      throw new Error("Missing required argument: componentName");
    } catch (error) {
      return formatToolResponse(null, error as Error);
    }
  }
);



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
