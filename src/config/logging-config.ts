import { LoggingConfig } from '../types/logging-types.js';

/** Configuration for the optional request logger; the MCP entry point does not enable it. */
export interface DatabaseLoggingConfig {
  enabled: boolean;
  endpoint: string;
  publishableKey: string;
  timeoutMs: number;
}

export function loadDatabaseLoggingConfig(
  env: Record<string, string | undefined> = process.env
): DatabaseLoggingConfig {
  const endpoint = (env.SUPABASE_LOGGING_URL ?? '').trim().replace(/\/+$/, '');
  const publishableKey = (env.SUPABASE_LOGGING_PUBLISHABLE_KEY ?? '').trim();
  let validEndpoint = false;
  try {
    const url = new URL(endpoint);
    validEndpoint =
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === '/';
  } catch {
    // Incomplete configuration leaves the optional logger disabled.
  }
  return {
    enabled:
      env.DISABLE_DATABASE_LOGGING !== 'true' &&
      validEndpoint &&
      publishableKey.startsWith('sb_publishable_'),
    endpoint,
    publishableKey,
    timeoutMs: 1500,
  };
}

// Load configuration from environment variables
export function loadLoggingConfig(): LoggingConfig {
  return {
    enableAnalyticsLogging: process.env.ENABLE_ANALYTICS_LOGGING === 'true',
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
    collectDetailedData: process.env.COLLECT_DETAILED_DATA === 'true',
    storeCodeContent: process.env.STORE_CODE_CONTENT === 'true',
    logPerformanceThresholdMs: parseInt(process.env.LOG_PERFORMANCE_THRESHOLD_MS || '5', 10),
    dataRetentionDays: parseInt(process.env.DATA_RETENTION_DAYS || '365', 10),
  };
}

// Validate configuration
export function validateLoggingConfig(config: LoggingConfig): boolean {
  if (!config.enableAnalyticsLogging) {
    return true; // Valid to have logging disabled
  }

  if (!config.supabaseUrl || !config.supabaseAnonKey) {
    console.warn('Supabase configuration missing. Analytics logging will be disabled.');
    return false;
  }

  if (config.logPerformanceThresholdMs < 0) {
    console.warn('Invalid performance threshold. Using default value.');
    return false;
  }

  if (config.dataRetentionDays < 1) {
    console.warn('Invalid data retention period. Using default value.');
    return false;
  }

  return true;
}

// Get default configuration
export function getDefaultLoggingConfig(): LoggingConfig {
  return {
    enableAnalyticsLogging: true,
    supabaseUrl: '',
    supabaseAnonKey: '',
    collectDetailedData: true,
    storeCodeContent: true,
    logPerformanceThresholdMs: 5,
    dataRetentionDays: 365,
  };
}
