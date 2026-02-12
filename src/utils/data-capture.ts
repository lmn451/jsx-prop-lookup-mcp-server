import { ComponentData } from '../types/logging-types.js';

interface PropData {
  name?: string;
  propName?: string;
  value?: unknown;
  type?: string;
  propType?: string;
  line?: number;
  lineNumber?: number;
  context?: string;
}

/**
 * Extract component data from analysis results for detailed logging
 */
export function extractComponentData(
  requestId: string,
  analysisResult: unknown,
  filePath?: string
): ComponentData[] {
  const componentData: ComponentData[] = [];

  if (!analysisResult || typeof analysisResult !== 'object') {
    return componentData;
  }

  const result = analysisResult as { 
    components?: unknown[]; 
    propUsages?: unknown[]; 
    summary?: unknown;
    files?: unknown[];
    [key: string]: unknown;
    propName?: string;
    name?: string;
    value?: unknown;
    type?: string;
    propType?: string;
    line?: number;
    lineNumber?: number;
    context?: string;
  };

  try {
    // Handle different response formats
    if (Array.isArray(result)) {
      // Array format - iterate through results
      result.forEach(item => {
        componentData.push(...extractFromItem(requestId, item, filePath));
      });
    } else if (result.files) {
      // Files format - iterate through files
      Object.entries(analysisResult.files).forEach(([file, data]) => {
        componentData.push(...extractFromItem(requestId, data, file));
      });
    } else {
      // Single item format
      componentData.push(...extractFromItem(requestId, analysisResult, filePath));
    }
  } catch (error) {
    console.warn('Failed to extract component data:', error);
  }

  return componentData;
}

/**
 * Extract component data from a single analysis item
 */
function extractFromItem(requestId: string, item: unknown, filePath?: string): ComponentData[] {
  const componentData: ComponentData[] = [];

  if (!item || typeof item !== 'object') {
    return componentData;
  }

  const analysisItem = item as { 
    components?: unknown[]; 
    props?: unknown[]; 
    file?: string; 
    componentName?: string; 
    name?: string;
    propName?: string;
    value?: unknown;
    type?: string;
    propType?: string;
    line?: number;
    lineNumber?: number;
    context?: string;
  };

  try {
    // Handle components array
    if (analysisItem.components && Array.isArray(analysisItem.components)) {
      analysisItem.components.forEach((component: unknown) => {
        const comp = component as { 
          props?: unknown[]; 
          name?: string; 
          componentName?: string; 
          file?: string; 
          line?: number; 
          context?: string;
          propName?: string;
          value?: unknown;
          type?: string;
          propType?: string;
          lineNumber?: number;
        };
        if (comp.props && Array.isArray(comp.props)) {
          comp.props.forEach((prop: unknown) => {
            const propData = prop as PropData;
            componentData.push({
              id: crypto.randomUUID(),
              requestId,
              filePath: filePath || analysisItem.file || comp.file || '',
              componentName: comp.name || comp.componentName || '',
              propName: propData.name || propData.propName || '',
              propValue: propData.value ? JSON.stringify(propData.value) : undefined,
              propType: propData.type || propData.propType || undefined,
              lineNumber: propData.line || propData.lineNumber || comp.line || undefined,
              codeContext: propData.context || comp.context || undefined,
              createdAt: new Date(),
            });
          });
        }
      });
    }

    // Handle direct props array
    if (analysisItem.props && Array.isArray(analysisItem.props)) {
      analysisItem.props.forEach((prop: unknown) => {
        const propData = prop as PropData;
        componentData.push({
          id: crypto.randomUUID(),
          requestId,
          filePath: filePath || analysisItem.file || '',
          componentName: analysisItem.componentName || analysisItem.name || '',
          propName: propData.name || propData.propName || '',
          propValue: propData.value ? JSON.stringify(propData.value) : undefined,
          propType: propData.type || propData.propType || undefined,
          lineNumber: propData.line || propData.lineNumber || undefined,
          codeContext: propData.context || undefined,
          createdAt: new Date(),
        });
      });
    }

    // Handle single prop
    if (analysisItem.propName || analysisItem.name) {
      componentData.push({
        id: crypto.randomUUID(),
        requestId,
        filePath: filePath || analysisItem.file || '',
        componentName: analysisItem.componentName || '',
        propName: (analysisItem.propName || analysisItem.name) as string,
        propValue: analysisItem.value ? JSON.stringify(analysisItem.value) : undefined,
        propType: (analysisItem.type || analysisItem.propType) as string | undefined,
        lineNumber: (analysisItem.line || analysisItem.lineNumber) as number | undefined,
        codeContext: (analysisItem.context) as string | undefined,
        createdAt: new Date(),
      });
    }
  } catch (error) {
    console.warn('Failed to extract from item:', error);
  }

  return componentData;
}

/**
 * Sanitize sensitive data from request parameters
 */
export function sanitizeRequestParams(params: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...params };

  // Remove potentially sensitive data
  const sensitiveKeys = ['password', 'token', 'key', 'secret', 'auth'];
  
  Object.keys(sanitized).forEach(key => {
    if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
      sanitized[key] = '[REDACTED]';
    }
  });

  return sanitized;
}

/**
 * Truncate large strings to prevent database issues
 */
export function truncateString(str: string | undefined, maxLength: number = 1000): string | undefined {
  if (!str) return str;
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength) + '...';
}

/**
 * Extract file path information for analytics
 */
export function extractPathInfo(path: string): {
  directory: string;
  filename: string;
  extension: string;
  isRelative: boolean;
} {
  const isRelative = !path.startsWith('/');
  const parts = path.split('/');
  const filename = parts[parts.length - 1] || '';
  const directory = parts.slice(0, -1).join('/') || '';
  const extension = filename.includes('.') ? filename.split('.').pop() || '' : '';

  return {
    directory,
    filename,
    extension,
    isRelative,
  };
}