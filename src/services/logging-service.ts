import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { 
  LoggingConfig, 
  SessionData, 
  RequestLogData, 
  ComponentData, 
  LogEntry,
  AnalyticsEvent 
} from '../types/logging-types.js';
import { loadLoggingConfig, validateLoggingConfig } from '../config/logging-config.js';
import { SessionManager } from './session-manager.js';

export class LoggingService {
  private supabase: SupabaseClient | null = null;
  private config: LoggingConfig;
  private sessionManager: SessionManager;
  private logQueue: LogEntry[] = [];
  private isProcessingQueue = false;
  private batchSize = 10;
  private flushInterval = 5000; // 5 seconds
  private flushTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.config = loadLoggingConfig();
    this.sessionManager = new SessionManager();
    
    if (this.config.enableAnalyticsLogging && validateLoggingConfig(this.config)) {
      this.initializeSupabase();
      this.startBatchProcessor();
    }
  }

  /**
   * Initialize Supabase client
   */
  private initializeSupabase(): void {
    try {
      this.supabase = createClient(this.config.supabaseUrl, this.config.supabaseAnonKey);
    } catch (error) {
      console.warn('Failed to initialize Supabase client:', error);
      this.supabase = null;
    }
  }

  /**
   * Start batch processing timer
   */
  private startBatchProcessor(): void {
    this.flushTimer = setInterval(() => {
      this.flushQueue();
    }, this.flushInterval);
  }

  /**
   * Log a request start event
   */
  public async logRequestStart(
    toolName: 'analyze_jsx_props' | 'query_components',
    params: Record<string, any>
  ): Promise<string> {
    if (!this.config.enableAnalyticsLogging || !this.supabase) {
      return ''; // Return empty ID if logging is disabled
    }

    try {
      const session = await this.sessionManager.getOrCreateSession();
      const requestId = crypto.randomUUID();
      
      const logEntry: LogEntry = {
        sessionData: session,
        requestData: {
          id: requestId,
          sessionId: session.id,
          toolName,
          requestTimestamp: new Date(),
          filePath: this.config.collectDetailedData ? params.path : undefined,
          componentName: this.config.collectDetailedData ? params.componentName : undefined,
          propName: this.config.collectDetailedData ? params.propName : undefined,
          formatType: params.format || 'full',
          requestParams: this.config.collectDetailedData ? params : {},
          responseTimeMs: 0,
          success: false, // Will be updated on completion
        },
        startTime: Date.now(),
      };

      this.logQueue.push(logEntry);
      return requestId;
    } catch (error) {
      console.warn('Failed to log request start:', error);
      return '';
    }
  }

  /**
   * Log a request completion
   */
  public async logRequestEnd(
    requestId: string,
    success: boolean,
    responseData?: any,
    error?: string,
    componentData?: ComponentData[]
  ): Promise<void> {
    if (!this.config.enableAnalyticsLogging || !requestId) {
      return;
    }

    try {
      const logEntry = this.logQueue.find(entry => entry.requestData.id === requestId);
      if (!logEntry) {
        return;
      }

      logEntry.endTime = Date.now();
      logEntry.requestData.responseTimeMs = logEntry.endTime - logEntry.startTime;
      logEntry.requestData.success = success;
      
      if (error) {
        logEntry.requestData.errorType = error;
      }

      if (this.config.storeCodeContent && responseData) {
        logEntry.requestData.responseData = responseData;
      }

      if (componentData) {
        logEntry.componentData = componentData;
      }

      // Queue will be processed by batch processor
    } catch (error) {
      console.warn('Failed to log request end:', error);
    }
  }

  /**
   * Flush the log queue to Supabase
   */
  private async flushQueue(): Promise<void> {
    if (this.isProcessingQueue || this.logQueue.length === 0 || !this.supabase) {
      return;
    }

    this.isProcessingQueue = true;

    try {
      const batch = this.logQueue.splice(0, this.batchSize);
      
      // Insert sessions (upsert to handle duplicates)
      const sessions = batch.map(entry => entry.sessionData);
      const uniqueSessions = sessions.filter((session, index, self) => 
        self.findIndex(s => s.id === session.id) === index
      );

      if (uniqueSessions.length > 0) {
        await this.supabase.from('sessions').upsert(uniqueSessions);
      }

      // Insert request logs
      const requestLogs = batch.map(entry => entry.requestData);
      if (requestLogs.length > 0) {
        await this.supabase.from('request_logs').insert(requestLogs);
      }

      // Insert component data
      const componentData = batch
        .filter(entry => entry.componentData)
        .flatMap(entry => entry.componentData!);
      
      if (componentData.length > 0) {
        await this.supabase.from('component_data').insert(componentData);
      }

    } catch (error) {
      console.warn('Failed to flush log queue:', error);
      // Re-add failed entries to queue for retry
      // Note: In production, you might want more sophisticated retry logic
    } finally {
      this.isProcessingQueue = false;
    }
  }

  /**
   * Log an analytics event
   */
  public async logEvent(event: AnalyticsEvent): Promise<void> {
    if (!this.config.enableAnalyticsLogging) {
      return;
    }

    // For now, just log to console. Could be extended to store in separate events table
    console.log('Analytics Event:', event);
  }

  /**
   * Shutdown the logging service
   */
  public async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Flush remaining logs
    await this.flushQueue();
    
    this.sessionManager.endSession();
  }

  /**
   * Get current configuration
   */
  public getConfig(): LoggingConfig {
    return { ...this.config };
  }

  /**
   * Check if logging is enabled
   */
  public isEnabled(): boolean {
    return this.config.enableAnalyticsLogging && this.supabase !== null;
  }
}

// Singleton instance
export const loggingService = new LoggingService();