import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { loadDatabaseLoggingConfig } from '../dist/config/logging-config.js';
import { RequestLogger } from '../dist/services/request-logger.js';

describe('database request logging', () => {
  test('disables incomplete or invalid logging configuration', () => {
    for (const env of [
      {
        SUPABASE_LOGGING_URL: 'not a URL',
        SUPABASE_LOGGING_PUBLISHABLE_KEY: 'sb_publishable_test',
      },
      { SUPABASE_LOGGING_URL: 'https://example.supabase.co' },
      {
        SUPABASE_LOGGING_URL: 'https://example.supabase.co',
        SUPABASE_LOGGING_PUBLISHABLE_KEY: 'sb_secret_test',
      },
      {
        SUPABASE_LOGGING_URL: 'https://example.supabase.co/path',
        SUPABASE_LOGGING_PUBLISHABLE_KEY: 'sb_publishable_test',
      },
    ])
      assert.equal(loadDatabaseLoggingConfig(env).enabled, false);
  });

  test('is disabled when no Supabase logging configuration is present', async () => {
    let calls = 0;
    const logger = new RequestLogger(loadDatabaseLoggingConfig({}), '4.0.0', async () => {
      calls += 1;
      return { ok: true };
    });

    await logger.record({
      toolName: 'analyze_jsx_props',
      durationMs: 12,
      success: true,
    });

    assert.equal(calls, 0);
  });

  test('honors the explicit opt-out switch', async () => {
    const config = loadDatabaseLoggingConfig({
      SUPABASE_LOGGING_URL: 'https://example.supabase.co',
      SUPABASE_LOGGING_PUBLISHABLE_KEY: 'sb_publishable_test',
      DISABLE_DATABASE_LOGGING: 'true',
    });

    assert.equal(config.enabled, false);
  });

  test('sends only the privacy-minimal request payload when configured', async () => {
    const requests = [];
    const config = loadDatabaseLoggingConfig({
      SUPABASE_LOGGING_URL: 'https://example.supabase.co/',
      SUPABASE_LOGGING_PUBLISHABLE_KEY: 'sb_publishable_test',
    });
    const logger = new RequestLogger(config, '4.0.0', async (input, init) => {
      requests.push({ input, init });
      return { ok: true };
    });

    await logger.record({
      toolName: 'find_prop_usage',
      durationMs: 999_999,
      success: false,
      errorCode: 'tool_error',
    });

    assert.equal(requests.length, 1);
    assert.equal(requests[0].input, 'https://example.supabase.co/rest/v1/mcp_request_logs');
    assert.equal(requests[0].init.method, 'POST');
    assert.equal(requests[0].init.headers.apikey, 'sb_publishable_test');
    assert.equal('Authorization' in requests[0].init.headers, false);
    assert.equal(requests[0].init.headers.Prefer, 'return=minimal');

    const payload = JSON.parse(requests[0].init.body);
    assert.deepEqual(Object.keys(payload).sort(), [
      'duration_ms',
      'error_code',
      'server_version',
      'success',
      'tool_name',
    ]);
    assert.deepEqual(payload, {
      server_version: '4.0.0',
      tool_name: 'find_prop_usage',
      duration_ms: 300_000,
      success: false,
      error_code: 'tool_error',
    });
  });
  test('does not surface telemetry failures to tool callers', async () => {
    const config = loadDatabaseLoggingConfig({
      SUPABASE_LOGGING_URL: 'https://example.supabase.co',
      SUPABASE_LOGGING_PUBLISHABLE_KEY: 'sb_publishable_test',
    });
    const logger = new RequestLogger(config, '4.0.0', async () => {
      throw new Error('network failure');
    });
    const originalConsoleError = console.error;
    console.error = () => {};

    try {
      await assert.doesNotReject(
        logger.record({
          toolName: 'get_component_props',
          durationMs: 4,
          success: true,
        })
      );
    } finally {
      console.error = originalConsoleError;
    }
  });

  test('aborts a stalled request after the configured timeout', { timeout: 2000 }, async (t) => {
    t.mock.method(console, 'error', () => {});
    const config = loadDatabaseLoggingConfig({
      SUPABASE_LOGGING_URL: 'https://example.supabase.co',
      SUPABASE_LOGGING_PUBLISHABLE_KEY: 'sb_publishable_test',
    });
    let signal;
    const logger = new RequestLogger({ ...config, timeoutMs: 5 }, '4.0.0', (_input, init) => {
      signal = init.signal;
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    });
    await assert.doesNotReject(
      logger.record({ toolName: 'analyze_jsx_props', durationMs: 1, success: true })
    );
    assert.equal(signal.aborted, true);
    assert.equal(console.error.mock.callCount(), 1);
  });

  test('warns once across repeated rejected responses and keeps accepting records', async (t) => {
    t.mock.method(console, 'error', () => {});
    const config = loadDatabaseLoggingConfig({
      SUPABASE_LOGGING_URL: 'https://example.supabase.co',
      SUPABASE_LOGGING_PUBLISHABLE_KEY: 'sb_publishable_test',
    });
    let calls = 0;
    const logger = new RequestLogger(config, '4.0.0', async () => {
      calls += 1;
      return { ok: false };
    });
    for (let i = 0; i < 3; i++) {
      await logger.record({ toolName: 'find_prop_usage', durationMs: 1, success: true });
    }
    assert.equal(calls, 3);
    assert.equal(console.error.mock.callCount(), 1);
  });

  test('normalizes negative and fractional durations in serialized records', async () => {
    const payloads = [];
    const config = loadDatabaseLoggingConfig({
      SUPABASE_LOGGING_URL: 'https://example.supabase.co',
      SUPABASE_LOGGING_PUBLISHABLE_KEY: 'sb_publishable_test',
    });
    const logger = new RequestLogger(config, '4.0.0', async (_input, init) => {
      payloads.push(JSON.parse(init.body));
      return { ok: true };
    });
    for (const durationMs of [-10, 12.6]) {
      await logger.record({ toolName: 'get_component_props', durationMs, success: true });
    }
    assert.deepEqual(
      payloads.map((p) => p.duration_ms),
      [0, 13]
    );
    assert.ok(payloads.every((p) => p.error_code === null));
  });
});
