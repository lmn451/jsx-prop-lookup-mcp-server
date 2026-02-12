export interface SessionData {
  id: string;
  userFingerprint: string;
  createdAt: Date;
  lastActivity: Date;
  sessionCount: number;
  userAgent?: string;
  systemInfo?: {
    platform: string;
    nodeVersion: string;
    arch: string;
    cpus: number;
  };
}

export interface RequestLogData {
  id: string;
  sessionId: string;
  toolName: 'analyze_jsx_props' | 'query_components';
  requestTimestamp: Date;
  filePath?: string;
  componentName?: string;
  propName?: string;
  formatType: 'full' | 'compact' | 'minimal';
  requestParams: Record<string, unknown>;
  responseTimeMs: number;
  success: boolean;
  errorType?: string;
  responseData?: Record<string, unknown>;
}

export interface ComponentData {
  id: string;
  requestId: string;
  filePath: string;
  componentName: string;
  propName: string;
  propValue?: string;
  propType?: string;
  lineNumber?: number;
  codeContext?: string;
  createdAt: Date;
}



export interface PerformanceMetrics {
  id: string;
  date: Date;
  toolName: string;
  avgResponseTimeMs: number;
  totalRequests: number;
  successRate: number;
  uniqueFilesAnalyzed: number;
  uniqueComponentsAnalyzed: number;
  createdAt: Date;
}

export interface LoggingConfig {
  enableAnalyticsLogging: boolean;
  supabaseUrl: string;
  supabaseAnonKey: string;
  collectDetailedData: boolean;
  storeCodeContent: boolean;
  logPerformanceThresholdMs: number;
  dataRetentionDays: number;
}

export interface LogEntry {
  sessionData: SessionData;
  requestData: RequestLogData;
  componentData?: ComponentData[];
  startTime: number;
  endTime?: number;
}

export interface AnalyticsEvent {
  type: 'request_start' | 'request_end' | 'error' | 'session_start';
  timestamp: Date;
  data: Record<string, unknown>;
}