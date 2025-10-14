#!/usr/bin/env node

// Ensure we're using the correct Node.js version
if (process.version.split(".")[0].slice(1) < "18") {
  console.error("Error: Node.js 18 or higher is required");
  process.exit(1);
}

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { JSXPropAnalyzer } from "./jsx-analyzer.js";
import * as path from "path";

/**
 * Validates that a path is absolute. Rejects relative paths with a hard error.
 * @param rawPath - The path to validate
 * @param paramName - The parameter name for error messages
 * @returns The validated absolute path
 * @throws Error if path is not absolute
 */
function validateAbsolutePath(
  rawPath: unknown,
  paramName: string = "path",
): string {
  if (typeof rawPath !== "string") {
    throw new Error(`Invalid argument: ${paramName} must be a string`);
  }

  const trimmedPath = rawPath.trim();
  if (!trimmedPath) {
    throw new Error(
      `Invalid argument: ${paramName} must be a non-empty string`,
    );
  }

  if (!path.isAbsolute(trimmedPath)) {
    const err = new Error(
      `Relative or non-absolute paths are not allowed. Provide an absolute path for ${paramName}`,
    );
    (err as any).code = "INVALID_ABSOLUTE_PATH";
    throw err;
  }

  return trimmedPath;
}

const server = new McpServer({
  name: "jsx-prop-lookup-server",
  version: "1.0.0",
});

const analyzer = new JSXPropAnalyzer();

// Register tools using the McpServer API
server.registerTool(
  "analyze_jsx_props",
  {
    title: "Analyze JSX Props",
    description: "Analyze JSX prop usage in files or directories",
    inputSchema: {
      path: z
        .string()
        .describe(
          "Absolute path to file or directory to analyze. Relative paths are not allowed.",
        ),
      componentName: z
        .string()
        .optional()
        .describe("Specific component name to analyze"),
      propName: z
        .string()
        .optional()
        .describe("Optional: specific prop name to search for"),
      includeTypes: z
        .boolean()
        .default(true)
        .describe("Include TypeScript type information"),
    },
  },
  async ({ path: rawPath, componentName, propName, includeTypes }) => {
    const validatedPath = validateAbsolutePath(rawPath, "path");
    const result = await analyzer.analyzeProps(
      validatedPath,
      componentName,
      propName,
      includeTypes ?? true,
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.registerTool(
  "find_prop_usage",
  {
    title: "Find Prop Usage",
    description: "Find all usages of a specific prop across JSX files",
    inputSchema: {
      propName: z.string().describe("Name of the prop to search for"),
      path: z
        .string()
        .describe(
          "Absolute path to directory to search in. Relative paths are not allowed.",
        ),
      componentName: z
        .string()
        .optional()
        .describe("Optional: limit search to specific component"),
    },
  },
  async ({ propName, path: rawPath, componentName }) => {
    const validatedPath = validateAbsolutePath(rawPath, "path");
    const result = await analyzer.findPropUsage(
      propName,
      validatedPath,
      componentName,
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.registerTool(
  "get_component_props",
  {
    title: "Get Component Props",
    description: "Get all props used by a specific component",
    inputSchema: {
      componentName: z.string().describe("Name of the component to analyze"),
      path: z
        .string()
        .describe(
          "Absolute path to directory to search in. Relative paths are not allowed.",
        ),
    },
  },
  async ({ componentName, path: rawPath }) => {
    const validatedPath = validateAbsolutePath(rawPath, "path");
    const result = await analyzer.getComponentProps(
      componentName,
      validatedPath,
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
);

server.registerTool(
  "find_components_without_prop",
  {
    title: "Find Components Missing Prop",
    description:
      "Find component instances that are missing a required prop (e.g., Select components without width prop)",
    inputSchema: {
      componentName: z
        .string()
        .describe('Name of the component to check (e.g., "Select")'),
      requiredProp: z
        .string()
        .describe('Name of the required prop (e.g., "width")'),
      path: z
        .string()
        .describe(
          "Absolute path to directory to search in. Relative paths are not allowed.",
        ),
      assumeSpreadHasRequiredProp: z
        .boolean()
        .default(true)
        .describe(
          "If true, any JSX spread attribute is assumed to provide the required prop.",
        ),
    },
  },
  async ({
    componentName,
    requiredProp,
    path: rawPath,
    assumeSpreadHasRequiredProp,
  }) => {
    const validatedPath = validateAbsolutePath(rawPath, "path");
    const result = await analyzer.findComponentsWithoutProp(
      componentName,
      requiredProp,
      validatedPath,
      assumeSpreadHasRequiredProp ?? true,
    );
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },
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
