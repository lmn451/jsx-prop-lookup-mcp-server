#!/usr/bin/env node

import { JSXPropAnalyzer } from "./jsx-analyzer.js";
import * as path from "path";
import { at, hasIndex, asError, exhaustive, safeJsonStringify } from "./utils/safety.js";
import {
  Command,
  AnalyzeJSXPropsArgs,
  FindPropUsageArgs,
  GetComponentPropsArgs,
  FindComponentsWithoutPropArgs,
} from "./schemas.js";
import { CLIError } from "./types/safety.js";

/**
 * Parsed CLI invocation with discriminated union type.
 */
type ParsedCommand =
  | { kind: "analyze_jsx_props"; path: string; componentName?: string; propName?: string; includeTypes: boolean }
  | { kind: "find_prop_usage"; path: string; propName: string; componentName?: string }
  | { kind: "get_component_props"; path: string; componentName: string }
  | { kind: "find_components_without_prop"; path: string; componentName: string; requiredProp: string; assumeSpreadHasRequiredProp: boolean };

/**
 * Parse command-line arguments with bounds checking and type validation.
 * Exits with error if arguments are invalid.
 */
function parseArgs(argv: readonly string[]): ParsedCommand {
  // Extract command from first argument
  const cmdArg = at(argv, 0);
  if (!cmdArg) {
    throw new CLIError(
      "No command provided. Usage: jsx-analyzer <command> --path <path> [options]\n" +
        "Commands: analyze_jsx_props, find_prop_usage, get_component_props, find_components_without_prop"
    );
  }

  // Parse named arguments with bounds checking
  const namedArgs: Record<string, string> = {};
  for (let i = 1; i < argv.length; i++) {
    const token = argv[i];
    if (typeof token !== "string" || !token.startsWith("--")) continue;

    const key = token.slice(2);
    if (!key) continue; // Skip empty keys (e.g., "--")

    // Check for value: either next token if it exists and doesn't start with --
    const nextIdx = i + 1;
    if (hasIndex(argv, nextIdx) && !String(argv[nextIdx]).startsWith("--")) {
      const value = argv[nextIdx];
      if (typeof value === "string") {
        namedArgs[key] = value;
        i++; // Skip the value token
      }
    }
  }

  // Validate command and dispatch
  const parsedCmd = Command.safeParse(cmdArg);
  if (!parsedCmd.success) {
    throw new CLIError(`Unknown command: "${cmdArg}"`);
  }

  const command = parsedCmd.data;

  // Resolve path: use provided --path or default to cwd
  const basePath = namedArgs["path"] ? path.resolve(namedArgs["path"]) : process.cwd();

  switch (command) {
    case "analyze_jsx_props": {
      const parsed = AnalyzeJSXPropsArgs.safeParse({
        path: basePath,
        componentName: namedArgs["componentName"],
        propName: namedArgs["propName"],
        includeTypes: namedArgs["includeTypes"] === "false" ? false : true,
      });
      if (!parsed.success) {
        throw new CLIError(`Validation error: ${parsed.error.message}`);
      }
      const result: ParsedCommand = {
        kind: "analyze_jsx_props",
        path: parsed.data.path,
        includeTypes: parsed.data.includeTypes,
        ...(parsed.data.componentName !== undefined ? { componentName: parsed.data.componentName } : {}),
        ...(parsed.data.propName !== undefined ? { propName: parsed.data.propName } : {}),
      };
      return result;
    }

    case "find_prop_usage": {
      const parsed = FindPropUsageArgs.safeParse({
        path: basePath,
        propName: namedArgs["propName"],
        componentName: namedArgs["componentName"],
      });
      if (!parsed.success) {
        throw new CLIError(`Validation error: ${parsed.error.message}`);
      }
      const result: ParsedCommand = {
        kind: "find_prop_usage",
        path: parsed.data.path,
        propName: parsed.data.propName,
        ...(parsed.data.componentName !== undefined ? { componentName: parsed.data.componentName } : {}),
      };
      return result;
    }

    case "get_component_props": {
      const parsed = GetComponentPropsArgs.safeParse({
        path: basePath,
        componentName: namedArgs["componentName"],
      });
      if (!parsed.success) {
        throw new CLIError(`Validation error: ${parsed.error.message}`);
      }
      const result: ParsedCommand = {
        kind: "get_component_props",
        path: parsed.data.path,
        componentName: parsed.data.componentName,
      };
      return result;
    }

    case "find_components_without_prop": {
      const parsed = FindComponentsWithoutPropArgs.safeParse({
        path: basePath,
        componentName: namedArgs["componentName"],
        requiredProp: namedArgs["requiredProp"],
        assumeSpreadHasRequiredProp: namedArgs["assumeSpreadHasRequiredProp"] === "false" ? false : true,
      });
      if (!parsed.success) {
        throw new CLIError(`Validation error: ${parsed.error.message}`);
      }
      const result: ParsedCommand = {
        kind: "find_components_without_prop",
        path: parsed.data.path,
        componentName: parsed.data.componentName,
        requiredProp: parsed.data.requiredProp,
        assumeSpreadHasRequiredProp: parsed.data.assumeSpreadHasRequiredProp,
      };
      return result;
    }

    default:
      exhaustive(command);
  }
}

const main = async (): Promise<void> => {
  try {
    const parsed = parseArgs(process.argv.slice(2));
    const analyzer = new JSXPropAnalyzer();

    let result: unknown;

    switch (parsed.kind) {
      case "analyze_jsx_props": {
        result = await analyzer.analyzeProps(
          parsed.path,
          parsed.componentName,
          parsed.propName,
          parsed.includeTypes
        );
        break;
      }

      case "find_prop_usage": {
        result = await analyzer.findPropUsage(
          parsed.propName,
          parsed.path,
          parsed.componentName
        );
        break;
      }

      case "get_component_props": {
        result = await analyzer.getComponentProps(
          parsed.componentName,
          parsed.path
        );
        break;
      }

      case "find_components_without_prop": {
        result = await analyzer.findComponentsWithoutProp(
          parsed.componentName,
          parsed.requiredProp,
          parsed.path,
          parsed.assumeSpreadHasRequiredProp
        );
        break;
      }

      default:
        exhaustive(parsed);
    }

    console.log(safeJsonStringify(result, "{}"));
  } catch (e: unknown) {
    const err = asError(e, "CLIError");
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
};

main().catch((e: unknown) => {
  const err = asError(e, "CLIError");
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
