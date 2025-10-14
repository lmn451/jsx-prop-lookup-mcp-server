#!/usr/bin/env node

import { JSXPropAnalyzer } from "./jsx-analyzer.js";
import * as path from "path";

// Basic argument parser
const parseArgs = () => {
  const args = process.argv.slice(2);
  const command = args[0];
  const namedArgs: { [key: string]: string } = {};
  for (let i = 1; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, "");
    const value = args[i + 1];
    namedArgs[key] = value;
  }
  return { command, namedArgs };
};

const main = async () => {
  const { command, namedArgs } = parseArgs();
  const analyzer = new JSXPropAnalyzer();

  if (!command) {
    console.error("Usage: jsx-analyzer <command> [options]");
    console.error(
      "Commands: analyze_jsx_props, find_prop_usage, get_component_props, find_components_without_prop",
    );
    process.exit(1);
  }

  try {
    let result;
    const targetPath = namedArgs.path
      ? path.resolve(namedArgs.path)
      : process.cwd();

    switch (command) {
      case "analyze_jsx_props":
        result = await analyzer.analyzeProps(
          targetPath,
          namedArgs.componentName,
          namedArgs.propName,
        );
        break;

      case "find_prop_usage":
        if (!namedArgs.propName) throw new Error("--propName is required");
        result = await analyzer.findPropUsage(
          namedArgs.propName,
          targetPath,
          namedArgs.componentName,
        );
        break;

      case "get_component_props":
        if (!namedArgs.componentName)
          throw new Error("--componentName is required");
        result = await analyzer.getComponentProps(
          namedArgs.componentName,
          targetPath,
        );
        break;

      case "find_components_without_prop":
        if (!namedArgs.componentName)
          throw new Error("--componentName is required");
        if (!namedArgs.requiredProp)
          throw new Error("--requiredProp is required");
        result = await analyzer.findComponentsWithoutProp(
          namedArgs.componentName,
          namedArgs.requiredProp,
          targetPath,
        );
        break;

      default:
        throw new Error(`Unknown command: ${command}`);
    }

    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(
      "Error:",
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }
};

main();
