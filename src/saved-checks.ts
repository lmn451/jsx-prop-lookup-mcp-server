import * as z from 'zod/v4';
import { checkJsx, validateRules, type JsxRule } from './check-jsx.js';
import type { ProjectWorkspace } from './project.js';
import type { PageOptions } from './results.js';

export interface SavedChecks {
  version: 1;
  rules: JsxRule[];
}

export interface SavedCheckOptions extends PageOptions {
  rulesFile: string;
  path?: string;
}

export type CheckExitCode = 0 | 1 | 2;
export type SavedCheckResult = Awaited<ReturnType<typeof checkJsx>> & { exitCode: CheckExitCode };

const savedChecksSchema = z.strictObject({ version: z.literal(1), rules: z.unknown() });

/** A saved-file read, JSON parse, or schema failure; CLI callers should exit 2. */
export class ConfigurationError extends Error {
  readonly exitCode = 2;

  constructor(file: string, cause: unknown) {
    super(`Cannot load saved checks ${file}: ${String(cause)}`, { cause });
    this.name = 'ConfigurationError';
  }
}

/** Read a fresh versioned document through the workspace's guarded read boundary. */
export function loadSavedChecks(project: ProjectWorkspace, file: string): SavedChecks {
  try {
    const saved = savedChecksSchema.parse(JSON.parse(project.readFile(file)));
    return { version: 1, rules: validateRules(saved.rules) };
  } catch (cause) {
    throw new ConfigurationError(file, cause);
  }
}

/** Exit status reflects the entire audit, including findings beyond this page. */
export function checkExitCode(result: Pick<SavedCheckResult, 'complete' | 'total'>): CheckExitCode {
  return !result.complete ? 2 : result.total > 0 ? 1 : 0;
}

/** Run a fresh saved audit without modifying source files or configuration. */
export async function runSavedChecks(
  project: ProjectWorkspace,
  options: SavedCheckOptions
): Promise<SavedCheckResult> {
  const { rulesFile, ...query } = options;
  const saved = loadSavedChecks(project, rulesFile);
  const result = await checkJsx(project, { ...query, rules: saved.rules });
  return { ...result, exitCode: checkExitCode(result) };
}
