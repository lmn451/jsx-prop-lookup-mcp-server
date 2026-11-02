import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { ProjectWorkspace } from './project.js';
import { createJsxSnapshot, collectJsx } from './jsx-query.js';
import { matchesComponent } from './find-jsx.js';
import { paginateResults, type PageOptions, type LocatedResult } from './results.js';

const names = z.array(z.string().trim().min(1));
export const jsxRuleSchema = z
  .strictObject({
    id: z.string().trim().min(1).optional(),
    component: z.string().trim().min(1),
    source: z.string().min(1).optional(),
    required: names.optional(),
    deprecated: names.optional(),
    forbidden: names.optional(),
  })
  .refine(
    (rule) =>
      (rule.required?.length ?? 0) +
        (rule.deprecated?.length ?? 0) +
        (rule.forbidden?.length ?? 0) >
      0,
    'A rule must declare at least one prop check'
  );

export type JsxRule = z.infer<typeof jsxRuleSchema>;
export interface CheckJsxQuery extends PageOptions {
  path?: string;
  rules: JsxRule[];
}
export interface JsxFinding extends LocatedResult {
  ruleId: string;
  kind: 'missing' | 'deprecated' | 'forbidden';
  component: string;
  prop: string;
  message: string;
}

export function validateRules(input: unknown): JsxRule[] {
  const parsed = z.array(jsxRuleSchema).min(1).safeParse(input);
  if (!parsed.success) throw new Error(`Invalid JSX rules: ${parsed.error.message}`);
  const ids = parsed.data.map((rule, index) => rule.id ?? `rule-${index + 1}`);
  if (new Set(ids).size !== ids.length)
    throw new Error('Invalid JSX rules: rule IDs must be unique');
  return parsed.data;
}

/** Audit every selected call site; page only after all findings are known. */
export async function checkJsx(project: ProjectWorkspace, query: CheckJsxQuery) {
  const rules = validateRules(query.rules);
  const snapshot = await createJsxSnapshot(project, query.path);
  const { matches, unresolved } = collectJsx(snapshot);
  const findings: JsxFinding[] = [];
  for (const [index, rule] of rules.entries()) {
    const ruleId = rule.id ?? `rule-${index + 1}`;
    for (const match of matches) {
      if (!matchesComponent(snapshot, match, rule)) continue;
      const location = { filePath: match.filePath, line: match.line, column: match.column };
      if (match.identity && !match.identity.definition) {
        unresolved.push({
          ...location,
          reason: `${ruleId}: cannot resolve component definition from ${match.identity.source}`,
        });
      }
      for (const [field, kind] of [
        ['required', 'missing'],
        ['deprecated', 'deprecated'],
        ['forbidden', 'forbidden'],
      ] as const) {
        for (const prop of new Set(rule[field] ?? [])) {
          const present = Object.hasOwn(match.props, prop);
          if (!present && match.unknownSpreads.length > 0) {
            unresolved.push({
              ...location,
              reason: `${ruleId}: unknown spread may supply ${prop} (${kind} check)`,
            });
          } else if (kind === 'missing' ? !present : present) {
            findings.push({
              ...location,
              snippet: match.snippet,
              ruleId,
              kind,
              component: match.component,
              prop,
              message: `${match.component}: ${kind} prop ${prop}`,
            });
          }
        }
      }
    }
  }
  const page = paginateResults(findings, query, unresolved);
  const status = !page.complete ? 'incomplete' : page.total > 0 ? 'fail' : 'pass';
  return { ...page, summary: { status, findings: page.total, unresolved: unresolved.length } };
}

export function registerCheckJsxTool(server: McpServer, project: ProjectWorkspace): void {
  server.registerTool(
    'check_jsx',
    {
      title: 'Check JSX',
      description:
        'Audit JSX for missing, deprecated, or forbidden props. Reports located findings and explicit uncertainty for unresolved spreads; never executes or edits source.',
      inputSchema: z.object({
        path: z.string().default('.'),
        rules: z.array(jsxRuleSchema).min(1),
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(500).default(100),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async (query) => {
      const result = await checkJsx(project, query);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        structuredContent: result,
      };
    }
  );
}
