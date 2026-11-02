import * as z from 'zod/v4';
import type { ProjectWorkspace } from './project.js';
import { createJsxSnapshot, collectJsx, type JsxIdentity, type PropValue } from './jsx-query.js';
import { matchesComponent } from './find-jsx.js';
import { paginateResults, type LocatedResult, type PageOptions } from './results.js';

export interface PropRemovalQuery extends PageOptions {
  component: string;
  prop: string;
  source?: string;
  path?: string;
}

export interface PropRemovalUsage extends LocatedResult {
  component: string;
  identity: JsxIdentity | null;
  prop: string;
  value: PropValue;
}

const proposedRemoval = z.object({
  component: z.string().trim().min(1),
  prop: z.string().trim().min(1),
});

/** Describe affected callers for a proposed removal; never change source files. */
export async function analyzePropRemoval(project: ProjectWorkspace, query: PropRemovalQuery) {
  const { component, prop } = proposedRemoval.parse(query);
  const snapshot = await createJsxSnapshot(project, query.path);
  const { matches, unresolved } = collectJsx(snapshot);
  const affected: PropRemovalUsage[] = [];
  for (const match of matches) {
    if (!matchesComponent(snapshot, match, { component, source: query.source })) continue;
    const location = { filePath: match.filePath, line: match.line, column: match.column };
    if (match.identity && !match.identity.definition) {
      unresolved.push({
        ...location,
        reason: `Cannot resolve component definition from ${match.identity.source}.`,
      });
    }
    if (Object.hasOwn(match.props, prop)) {
      affected.push({
        ...location,
        snippet: match.snippet,
        component: match.component,
        identity: match.identity,
        prop,
        value: match.props[prop],
      });
    } else if (match.unknownSpreads.length > 0) {
      unresolved.push({
        ...location,
        reason: `Unknown JSX spread may supply prop ${prop}: ${match.unknownSpreads.join(', ')}.`,
      });
    }
  }
  const page = paginateResults(affected, query, unresolved);
  return {
    ...page,
    summary: {
      action: 'remove-prop' as const,
      component,
      prop,
      affected: page.total,
      unresolved: unresolved.length,
    },
  };
}
