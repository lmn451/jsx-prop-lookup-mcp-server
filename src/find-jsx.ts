import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { ProjectWorkspace } from './project.js';
import { paginateResults, type PageOptions, type UnresolvedCase } from './results.js';
import { collectJsx, createJsxSnapshot, type JsxMatch, type JsxSnapshot } from './jsx-query.js';

export interface FindJsxQuery extends PageOptions {
  path?: string;
  component?: string;
  source?: string;
  prop?: string;
  value?: string;
}

export function matchesComponent(
  snapshot: JsxSnapshot,
  match: JsxMatch,
  query: Pick<FindJsxQuery, 'component' | 'source'>
): boolean {
  const { identity } = match;
  if (
    query.component &&
    query.component !== match.component &&
    query.component !== identity?.exportName &&
    query.component !== identity?.definition?.name
  )
    return false;
  if (!query.source) return true;
  if (!identity) return false;
  if (query.source === identity.source) return true;
  const filterModule = snapshot.resolveModule(query.source, match.filePath);
  return (
    filterModule !== undefined &&
    (filterModule === identity.definition?.filePath ||
      filterModule === snapshot.resolveModule(identity.source, match.filePath))
  );
}

/** Find JSX call sites without evaluating project code. */
export async function findJsx(project: ProjectWorkspace, query: FindJsxQuery = {}) {
  if (query.value !== undefined && query.prop === undefined)
    throw new Error('A value filter requires a prop filter.');
  const snapshot = await createJsxSnapshot(project, query.path);
  const collected = collectJsx(snapshot);
  const unresolved: UnresolvedCase[] = [...collected.unresolved];
  const matches: JsxMatch[] = [];
  for (const match of collected.matches) {
    if (!matchesComponent(snapshot, match, query)) continue;
    const diagnostic = (reason: string) =>
      unresolved.push({ filePath: match.filePath, line: match.line, column: match.column, reason });
    if (match.identity && !match.identity.definition)
      diagnostic(`Cannot resolve component definition from ${match.identity.source}.`);
    for (const expression of match.unknownSpreads)
      diagnostic(`Unresolved JSX spread: ${expression}`);
    if (query.prop !== undefined) {
      const prop = match.props[query.prop];
      if (!Object.hasOwn(match.props, query.prop)) continue;
      if (query.value !== undefined) {
        if (prop.status === 'unknown') {
          diagnostic(`Cannot resolve value of prop ${query.prop}.`);
          continue;
        }
        if (typeof prop.value === 'object' && prop.value !== null) {
          diagnostic(`Prop ${query.prop} is not a primitive value.`);
          continue;
        }
        if (String(prop.value) !== query.value) continue;
      }
    }
    matches.push(match);
  }
  return paginateResults(matches, query, unresolved);
}

/** Register the search boundary while sharing the caller's configured workspace. */
export function registerFindJsxTool(server: McpServer, project: ProjectWorkspace): void {
  server.registerTool(
    'find_jsx',
    {
      title: 'Find JSX',
      description:
        'Find JSX call sites by component import identity, source module, and prop. Returns sorted paginated matches, snippets, known prop values, and explicit unresolved cases.',
      inputSchema: z.object({
        path: z.string().default('.').describe('File or directory within the configured project.'),
        component: z
          .string()
          .optional()
          .describe('Local tag or original export name; use default for default imports.'),
        source: z
          .string()
          .optional()
          .describe('Import specifier, or a securely resolvable local module.'),
        prop: z.string().optional().describe('Prop that must be explicitly or statically present.'),
        value: z
          .string()
          .optional()
          .describe('Primitive prop value converted to a string; requires prop.'),
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(500).default(100),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async (query) => {
      const result = await findJsx(project, query);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        structuredContent: result,
      };
    }
  );
}
