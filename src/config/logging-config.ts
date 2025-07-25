import { LoggingConfig } from '../types/logging-types.js';

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