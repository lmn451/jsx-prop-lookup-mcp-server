import type { DatabaseLoggingConfig } from '../config/logging-config.js';

export const LOGGED_TOOL_NAMES = [
  'analyze_jsx_props',
  'find_prop_usage',
  'get_component_props',
  'find_components_without_prop',
] as const;

export type LoggedToolName = (typeof LOGGED_TOOL_NAMES)[number];

export interface RequestLogEntry {
  toolName: LoggedToolName;
  durationMs: number;
  success: boolean;
  errorCode?: 'tool_error';
}

type FetchImplementation = (
  input: string,
  init: NonNullable<Parameters<typeof fetch>[1]>
) => ReturnType<typeof fetch>;

const MAX_DURATION_MS = 300_000;

const clampDuration = (durationMs: number): number =>
  Math.min(MAX_DURATION_MS, Math.max(0, Math.round(durationMs)));

/**
 * Best-effort writer for the privacy-minimal request log table.
 *
 * A failed telemetry request never affects the MCP tool response. The logger
 * sends no tool arguments, paths, prop values, source content, or error text.
 */
export class RequestLogger {
  private hasWarned = false;

  public constructor(
    private readonly config: DatabaseLoggingConfig,
    private readonly serverVersion: string,
    private readonly fetchImplementation: FetchImplementation = (input, init) => fetch(input, init)
  ) {}

  public async record(entry: RequestLogEntry): Promise<void> {
    if (!this.config.enabled || !this.config.endpoint || !this.config.publishableKey) {
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await this.fetchImplementation(
        `${this.config.endpoint}/rest/v1/mcp_request_logs`,
        {
          method: 'POST',
          headers: {
            apikey: this.config.publishableKey,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({
            server_version: this.serverVersion,
            tool_name: entry.toolName,
            duration_ms: clampDuration(entry.durationMs),
            success: entry.success,
            error_code: entry.errorCode ?? null,
          }),
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        throw new Error('request rejected');
      }
    } catch {
      this.warnOnce();
    } finally {
      clearTimeout(timeout);
    }
  }

  private warnOnce(): void {
    if (this.hasWarned) {
      return;
    }

    this.hasWarned = true;
    console.error('Database logging request failed; analysis continues without telemetry.');
  }
}
