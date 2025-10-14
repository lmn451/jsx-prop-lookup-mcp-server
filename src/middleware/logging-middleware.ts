import { LoggingService } from '../services/logging-service.js';
import { extractComponentData, sanitizeRequestParams } from '../utils/data-capture.js';

export class LoggingMiddleware {
  constructor(private loggingService: LoggingService) {}

  /**
   * Wrap a tool handler with logging
   */
  public wrapToolHandler<T extends any[], R>(
    toolName: 'analyze_jsx_props' | 'query_components',
    handler: (...args: T) => Promise<R>
  ) {
    return async (...args: T): Promise<R> => {
      if (!this.loggingService.isEnabled()) {
        return handler(...args);
      }

      // Extract parameters for logging
      const params = this.extractParams(toolName, args);
      const sanitizedParams = sanitizeRequestParams(params);

      // Start logging
      const requestId = await this.loggingService.logRequestStart(toolName, sanitizedParams);
      
      const startTime = Date.now();
      let result: R;
      let success = false;
      let error: string | undefined;

      try {
        result = await handler(...args);
        success = true;
        
        // Extract component data if detailed collection is enabled
        const componentData = this.loggingService.getConfig().collectDetailedData
          ? extractComponentData(requestId, result, params.path)
          : undefined;

        // Log completion
        await this.loggingService.logRequestEnd(
          requestId,
          success,
          this.loggingService.getConfig().storeCodeContent ? result : undefined,
          error,
          componentData
        );

        return result;
      } catch (err) {
        success = false;
        error = err instanceof Error ? err.message : String(err);
        
        await this.loggingService.logRequestEnd(requestId, success, undefined, error);
        throw err;
      }
    };
  }

  /**
   * Extract parameters from function arguments
   */
  private extractParams(toolName: string, args: any[]): Record<string, any> {
    const params: Record<string, any> = {};

    if (toolName === 'analyze_jsx_props') {
      // First argument is path, second is options
      if (args.length > 0) {
        params.path = args[0];
      }
      if (args.length > 1 && typeof args[1] === 'object') {
        Object.assign(params, args[1]);
      }
    } else if (toolName === 'query_components') {
      // Arguments: componentName, propCriteria, options
      if (args.length > 0) {
        params.componentName = args[0];
      }
      if (args.length > 1) {
        params.propCriteria = args[1];
      }
      if (args.length > 2 && typeof args[2] === 'object') {
        Object.assign(params, args[2]);
        if (args[2].directory) {
          params.path = args[2].directory;
        }
      }
    }

    return params;
  }
}