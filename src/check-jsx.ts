import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import { ProjectWorkspace } from './project.js';
import { createJsxSnapshot, collectJsx, createJsxMatch, getJsxOpeningNodes } from './jsx-query.js';
import { matchesComponent } from './find-jsx.js';
import { paginateResults, type PageOptions, type LocatedResult } from './results.js';
import { getPropContract, suggestProp } from './prop-contract.js';

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
  rules?: JsxRule[];
  undeclared?: boolean;
}
export interface JsxFinding extends LocatedResult {
  ruleId: string;
  kind: 'missing' | 'deprecated' | 'forbidden' | 'undeclared';
  elementId: string;
  suggestion?: string;
  forwarding?: import('./prop-contract.js').RestDestination;
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
  const rules = query.rules === undefined && query.undeclared ? [] : validateRules(query.rules);
  const snapshot = await createJsxSnapshot(project, query.path);
  const { matches, unresolved } = collectJsx(snapshot);
  const findings: JsxFinding[] = [];
  if (query.undeclared) {
    for (const source of snapshot.files) {
      for (const node of getJsxOpeningNodes(source)) {
        const component = node.tagName.getText(source);
        if (/^[a-z]/.test(component) && !component.includes('.')) continue;
        const match = createJsxMatch(snapshot, source, node);
        const location = { filePath: match.filePath, line: match.line, column: match.column };
        const contract = getPropContract(snapshot, node.tagName);
        if (contract.uncertain) {
          unresolved.push({ ...location, reason: component + ': ' + contract.uncertain });
          continue;
        }
        if (contract.open) continue;
        if (match.unknownSpreads.length)
          unresolved.push({
            ...location,
            reason: component + ': unknown spread may supply undeclared props',
          });
        for (const prop of Object.keys(match.props)) {
          if (prop === 'key' || contract.names.has(prop)) continue;
          const suggestion = suggestProp(prop, contract.names);
          findings.push({
            ...location,
            elementId: location.filePath + ':' + location.line + ':' + location.column,
            snippet: match.snippet,
            ruleId: 'undeclared-props',
            kind: 'undeclared',
            component,
            prop,
            ...(suggestion ? { suggestion } : {}),
            ...(contract.forwarding ? { forwarding: contract.forwarding } : {}),
            message:
              component +
              ': undeclared prop ' +
              prop +
              (suggestion ? '; did you mean ' + suggestion + '?' : ''),
          });
        }
      }
    }
  }
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
              elementId: `${match.filePath}:${match.line}:${match.column}`,
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
        'Audit JSX for undeclared props (undeclared: true), or missing, deprecated, or forbidden props using rules. Reports located findings and explicit uncertainty for unresolved spreads; never executes or edits source.',
      inputSchema: z.object({
        path: z.string().default('.'),
        rules: z.array(jsxRuleSchema).min(1).optional(),
        undeclared: z
          .boolean()
          .default(false)
          .describe(
            'Check passed props against resolved component contracts without hand-written rules.'
          ),
        summaryOnly: z.boolean().default(false),
        fields: z.array(z.string().min(1)).optional(),
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
