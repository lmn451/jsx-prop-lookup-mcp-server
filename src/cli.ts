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

const showHelp = (isError = false) => {
  const output = `jsx-analyzer - JSX prop usage analyzer

Usage: jsx-analyzer <command> [options]

Commands:

  analyze_jsx_props
    Analyzes JSX prop usage in files
    Options:
      --path <path>              Path to file or directory (default: current directory)
      --componentName <name>     Filter by component name (optional)
      --propName <name>          Filter by prop name (optional)

  find_prop_usage
    Finds all usages of a specific prop
    Options:
      --propName <name>          Prop name to search for (required)
      --path <path>              Path to file or directory (default: current directory)
      --componentName <name>     Filter by component name (optional)

  get_component_props
    Gets all props for a specific component
    Options:
      --componentName <name>     Component name to analyze (required)
      --path <path>              Path to file or directory (default: current directory)

  find_components_without_prop
    Finds component instances missing a required prop
    Options:
      --componentName <name>     Component name to search for (required)
      --requiredProp <prop>      Prop that should be present (required)
      --path <path>              Path to file or directory (default: current directory)

Examples:
  jsx-analyzer analyze_jsx_props --path ./src
  jsx-analyzer find_prop_usage --propName onClick --path ./components
  jsx-analyzer get_component_props --componentName Button --path ./src
  jsx-analyzer find_components_without_prop --componentName Select --requiredProp width --path ./examples

Global Options:
  -h, --help     Show this help message
`;
  if (isError) {
    console.error(output);
  } else {
    console.log(output);
  }
};

const main = async () => {
  const { command, namedArgs } = parseArgs();
  const analyzer = new JSXPropAnalyzer();

  const isHelpRequested = command === "-h" || command === "--help" || namedArgs.h || namedArgs.help;
  
  if (!command) {
    showHelp(true);
    process.exit(1);
  }

  if (isHelpRequested) {
    showHelp(false);
    process.exit(0);
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
