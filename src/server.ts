import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { JSXPropAnalyzer } from './jsx-analyzer.js';
import { registerFindJsxTool } from './find-jsx.js';
import { ProjectWorkspace, type ProjectOptions } from './project.js';
import { PACKAGE_VERSION } from './version.js';

async function toolResult(result: Promise<unknown>) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(await result, null, 2) }] };
}

export function createServer(options: readonly string[] | ProjectOptions = []): McpServer {
  const analyzer = new JSXPropAnalyzer(options);
  const server = new McpServer({ name: 'jsx-prop-lookup-server', version: PACKAGE_VERSION });
  const annotations = { readOnlyHint: true, destructiveHint: false };
  const directory = z.string().default('.').describe('Directory to search.');

  server.registerTool(
    'analyze_jsx_props',
    {
      title: 'Analyze JSX props',
      description:
        'Analyze JSX/React component prop usage across JavaScript and TypeScript files. Returns component definitions, prop usages, source locations, readable values, and optional TypeScript prop interface names.',
      inputSchema: z.object({
        path: z
          .string()
          .default('.')
          .describe('Absolute or relative file or directory path to analyze.'),
        componentName: z
          .string()
          .optional()
          .describe('Optional component name filter, including a namespaced local name.'),
        propName: z.string().optional().describe('Optional prop name filter.'),
        includeTypes: z
          .boolean()
          .default(true)
          .describe('Include TypeScript interface and type-alias information.'),
      }),
      annotations,
    },
    ({ path, componentName, propName, includeTypes }) =>
      toolResult(analyzer.analyzeProps(path, componentName, propName, includeTypes))
  );

  server.registerTool(
    'find_prop_usage',
    {
      title: 'Find prop usage',
      description:
        'Find all usages of a named prop across JSX/React files. Returns component names, file locations, and values passed to the prop.',
      inputSchema: z.object({
        propName: z.string().describe('Name of the prop to search for.'),
        directory,
        componentName: z.string().optional().describe('Optional component name filter.'),
      }),
      annotations,
    },
    ({ propName, directory, componentName }) =>
      toolResult(analyzer.findPropUsage(propName, directory, componentName))
  );

  server.registerTool(
    'get_component_props',
    {
      title: 'Get component props',
      description:
        'Get detailed information about the props used by a named component, including locations and associated TypeScript prop interface names.',
      inputSchema: z.object({
        componentName: z.string().describe('Name of the component to analyze.'),
        directory,
      }),
      annotations,
    },
    ({ componentName, directory }) =>
      toolResult(analyzer.getComponentProps(componentName, directory))
  );

  server.registerTool(
    'find_components_without_prop',
    {
      title: 'Find missing required props',
      description:
        'Find instances of a named component that do not provide a required prop. JSX spread attributes are treated as potentially containing the required prop.',
      inputSchema: z.object({
        componentName: z.string().describe('Name of the component to check.'),
        requiredProp: z.string().describe('Name of the required prop.'),
        directory,
      }),
      annotations,
    },
    ({ componentName, requiredProp, directory }) =>
      toolResult(analyzer.findComponentsWithoutProp(componentName, requiredProp, directory))
  );

  const projectOptions: ProjectOptions = Array.isArray(options)
    ? { allowedRoots: options, root: options[0] }
    : options as ProjectOptions;
  registerFindJsxTool(server, new ProjectWorkspace(projectOptions));
  return server;
}
