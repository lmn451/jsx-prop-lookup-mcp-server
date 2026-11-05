import { parseArgs } from 'node:util';
import { ProjectWorkspace, type ProjectOptions } from './project.js';
import { findJsx, type FindJsxQuery } from './find-jsx.js';
import { inspectComponent } from './inspect-component.js';
import { runSavedChecks, checkExitCode } from './saved-checks.js';
import { checkJsx } from './check-jsx.js';

type Command = 'query' | 'inspect' | 'check' | 'serve';
export interface CommandLine {
  action: 'run';
  command: Command;
  json: boolean;
  legacyTools: boolean;
  project: ProjectOptions;
  query: FindJsxQuery & { removeProp?: string; undeclared?: boolean };
  rulesFile?: string;
}
export type ParsedCommandLine = CommandLine | { action: 'help' } | { action: 'version' };

const commandOptions: Record<Command, readonly string[]> = {
  query: [
    'path',
    'component',
    'source',
    'prop',
    'value',
    'offset',
    'limit',
    'json',
    'discovery',
    'summary-only',
    'fields',
  ],
  inspect: [
    'path',
    'component',
    'source',
    'remove-prop',
    'offset',
    'limit',
    'json',
    'summary-only',
    'fields',
  ],
  check: ['path', 'rules', 'undeclared', 'offset', 'limit', 'json', 'summary-only', 'fields'],
  serve: ['legacy-tools'],
};
const sharedOptions = ['project-root', 'tsconfig', 'allowed-roots'];

/** Parse flags without reading the project or starting a server. */
export function parseCommandLine(
  args: string[],
  environment: Readonly<Record<string, string | undefined>> = process.env
): ParsedCommandLine {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean' },
      json: { type: 'boolean' },
      undeclared: { type: 'boolean' },
      'summary-only': { type: 'boolean' },
      fields: { type: 'string' },
      'legacy-tools': { type: 'boolean' },
      'project-root': { type: 'string' },
      'allowed-roots': { type: 'string' },
      tsconfig: { type: 'string' },
      path: { type: 'string' },
      component: { type: 'string' },
      source: { type: 'string' },
      prop: { type: 'string' },
      'remove-prop': { type: 'string' },
      discovery: { type: 'string' },
      value: { type: 'string' },
      rules: { type: 'string' },
      offset: { type: 'string' },
      limit: { type: 'string' },
    },
  });
  if (values.help) return { action: 'help' };
  if (values.version) return { action: 'version' };
  const name = positionals[0] ?? 'serve';
  if (!Object.hasOwn(commandOptions, name)) throw new Error(`Unknown command: ${name}`);
  if (positionals.length > 1) throw new Error('Use flags instead of positional arguments.');
  const command = name as Command;
  for (const option of Object.keys(values)) {
    if (!sharedOptions.includes(option) && !commandOptions[command].includes(option))
      throw new Error(`Option --${option} is not supported by ${command}.`);
  }
  if (command === 'inspect' && !values.component?.trim())
    throw new Error('inspect requires --component.');
  if (command === 'check' && !values.rules?.trim() && !values.undeclared)
    throw new Error('check requires --rules or --undeclared.');
  if (values.value !== undefined && values.prop === undefined)
    throw new Error('--value requires --prop.');
  const query: CommandLine['query'] = {};
  if (values.undeclared) query.undeclared = true;
  if (values['summary-only']) query.summaryOnly = true;
  if (values.fields !== undefined) {
    query.fields = values.fields.split(',').map((field) => field.trim());
    if (query.fields.some((field) => !field))
      throw new Error('--fields requires comma-separated field names.');
  }
  if (values.discovery !== undefined) {
    if (values.discovery !== 'typescript' && values.discovery !== 'swc')
      throw new Error('--discovery must be typescript or swc.');
    query.discovery = values.discovery;
  }
  if (values['remove-prop'] !== undefined) query.removeProp = values['remove-prop'];
  for (const key of ['path', 'component', 'source', 'prop', 'value'] as const) {
    if (values[key] !== undefined) query[key] = values[key];
  }
  for (const key of ['offset', 'limit'] as const) {
    const text = values[key];
    if (text === undefined) continue;
    const value = Number(text);
    if (
      !text.trim() ||
      !Number.isSafeInteger(value) ||
      value < (key === 'offset' ? 0 : 1) ||
      (key === 'limit' && value > 500)
    )
      throw new Error(
        `--${key} must be ${key === 'offset' ? 'a non-negative safe integer' : 'an integer from 1 to 500'}.`
      );
    query[key] = value;
  }
  const allowedRoots = (values['allowed-roots'] ?? environment.ALLOWED_ROOTS ?? '')
    .split(',')
    .map((root) => root.trim())
    .filter(Boolean);
  return {
    action: 'run',
    command,
    json: values.json ?? false,
    legacyTools: values['legacy-tools'] ?? false,
    project: {
      root: values['project-root'] ?? environment.PROJECT_ROOT,
      allowedRoots,
      tsconfig: values.tsconfig,
    },
    query,
    rulesFile: values.rules,
  };
}

type QueryResult = Awaited<ReturnType<typeof findJsx>>;
type InspectionResult = Awaited<ReturnType<typeof inspectComponent>>;
type CheckResult = Awaited<ReturnType<typeof runSavedChecks>>;
export type CommandResult = QueryResult | InspectionResult | CheckResult;

/** Execute a command against the same workspace-backed APIs used by MCP. */
export async function executeCommand(options: CommandLine) {
  const project = new ProjectWorkspace(options.project);
  let result: CommandResult;
  if (options.command === 'query') result = await findJsx(project, options.query);
  else if (options.command === 'inspect')
    result = await inspectComponent(project, {
      ...options.query,
      component: options.query.component!,
    });
  else if (options.command === 'check') {
    if (options.rulesFile)
      result = await runSavedChecks(project, { ...options.query, rulesFile: options.rulesFile });
    else {
      const checked = await checkJsx(project, { ...options.query, undeclared: true });
      result = { ...checked, exitCode: checkExitCode(checked) };
    }
  } else throw new Error('serve must run through the stdio server.');
  return { result, exitCode: 'exitCode' in result ? result.exitCode : result.complete ? 0 : 2 };
}

/** Compact human output; JSON callers receive the unmodified result instead. */
export function renderHumanResult(result: CommandResult): string {
  if (result.unresolvedCount !== undefined)
    return `${result.total} matches; ${result.unresolvedCount} unresolved; ${result.complete ? 'complete' : 'incomplete'}.`;
  const lines = result.matches.map((match) => {
    if (
      !match.filePath ||
      !match.line ||
      !match.column ||
      ('name' in match && !Array.isArray(match.props))
    )
      return JSON.stringify(match);
    const label =
      'message' in match
        ? match.message
        : 'name' in match
          ? `${match.name}: ${match.props.map((prop) => `${prop.name}: ${prop.type}`).join(', ')}`
          : 'prop' in match
            ? `${match.component}: remove prop ${match.prop}`
            : match.component;
    return `${match.filePath}:${match.line}:${match.column} ${label}`;
  });
  if (lines.length === 0)
    lines.push(
      result.total > 0 ? `No matches on this page (${result.total} total).` : 'No matches.'
    );
  for (const item of result.unresolved) lines.push(`Unresolved: ${item.filePath} ${item.reason}`);
  return lines.join('\n');
}

export function cliError(error: unknown) {
  return {
    error: { message: error instanceof Error ? error.message : String(error) },
    exitCode: 2,
  };
}
