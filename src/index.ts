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

// Define Zod schemas for tool inputs - both raw shape for server.tool() and objects for parsing
const AnalyzeJSXPropsShape = {
  path: z.string().describe("File or directory path to analyze"),
  componentName: z.string().optional().describe("Optional: specific component name to analyze"),
  propName: z.string().optional().describe("Optional: specific prop name to search for"),
  includeTypes: z.boolean().default(true).describe("Include TypeScript type information"),
};

const FindPropUsageShape = {
  propName: z.string().describe("Name of the prop to search for"),
  directory: z.string().default(".").describe("Directory to search in"),
  componentName: z.string().optional().describe("Optional: limit search to specific component"),
};

const GetComponentPropsShape = {
  componentName: z.string().describe("Name of the component to analyze"),
  directory: z.string().default(".").describe("Directory to search in"),
};

const FindComponentsWithoutPropShape = {
  componentName: z.string().describe('Name of the component to check (e.g., "Select")'),
  requiredProp: z.string().describe('Name of the required prop (e.g., "width")'),
  directory: z.string().default(".").describe("Directory to search in"),
};

// Create Zod objects for parsing
const AnalyzeJSXPropsSchema = z.object(AnalyzeJSXPropsShape);
const FindPropUsageSchema = z.object(FindPropUsageShape);
const GetComponentPropsSchema = z.object(GetComponentPropsShape);
const FindComponentsWithoutPropSchema = z.object(FindComponentsWithoutPropShape);

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

// Register tools using server.tool() with manual validation to bypass SDK issues
server.tool(
  "analyze_jsx_props",
  {},
  async (args) => {
    try {
      const typedArgs = args as any;
      if (!typedArgs.path || typeof typedArgs.path !== 'string') {
        throw new Error("Missing required argument: path");
      }
      
      const absPath = resolveAndValidatePath(typedArgs.path, "path");
      const result = await analyzer.analyzeProps(
        absPath,
        typedArgs.componentName,
        typedArgs.propName,
        typedArgs.includeTypes ?? true
      );
      return formatToolResponse(result);
    } catch (error) {
      return formatToolResponse(null, error instanceof Error ? error : new Error(String(error)));
    }
  }
);

server.tool(
  "find_prop_usage",
  {},
  async (args) => {
    console.error('Debug: find_prop_usage called with args:', JSON.stringify(args, null, 2));
    console.error('Debug: args type:', typeof args);
    console.error('Debug: args keys:', args ? Object.keys(args) : 'args is null/undefined');
    try {
      // Manual validation to control error message format
      if (!args || typeof args !== 'object') {
        throw new Error("Invalid arguments: expected object");
      }
      
      const typedArgs = args as any;
      if (!typedArgs.propName || typeof typedArgs.propName !== 'string') {
        throw new Error("Missing required argument: propName");
      }
      
      const absDir = resolveAndValidatePath(typedArgs.directory || ".", "directory");
      const result = await analyzer.findPropUsage(
        typedArgs.propName,
        absDir,
        typedArgs.componentName
      );
      return formatToolResponse(result);
    } catch (error) {
      console.error('Debug: error in handler:', error instanceof Error ? error.message : String(error));
      return formatToolResponse(null, error instanceof Error ? error : new Error(String(error)));
    }
  }
);

server.tool(
  "get_component_props",
  {},
  async (args) => {
    try {
      const typedArgs = args as any;
      if (!typedArgs.componentName || typeof typedArgs.componentName !== 'string') {
        throw new Error("Missing required argument: componentName");
      }
      
      const absDir = resolveAndValidatePath(typedArgs.directory || ".", "directory");
      const result = await analyzer.getComponentProps(
        typedArgs.componentName,
        absDir
      );
      return formatToolResponse(result);
    } catch (error) {
      return formatToolResponse(null, error instanceof Error ? error : new Error(String(error)));
    }
  }
);

server.tool(
  "find_components_without_prop",
  {},
  async (args) => {
    try {
      const typedArgs = args as any;
      if (!typedArgs.componentName || typeof typedArgs.componentName !== 'string') {
        throw new Error("Missing required argument: componentName");
      }
      
      if (!typedArgs.requiredProp || typeof typedArgs.requiredProp !== 'string') {
        throw new Error("Missing required argument: requiredProp");
      }
      
      const absDir = resolveAndValidatePath(typedArgs.directory || ".", "directory");
      const result = await analyzer.findComponentsWithoutProp(
        typedArgs.componentName,
        typedArgs.requiredProp,
        absDir
      );
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
