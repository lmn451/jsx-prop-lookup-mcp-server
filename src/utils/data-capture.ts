import { ComponentData } from '../types/logging-types.js';

/**
 * Extract component data from analysis results for detailed logging
 */
export function extractComponentData(
  requestId: string,
  analysisResult: any,
  filePath?: string
): ComponentData[] {
  const componentData: ComponentData[] = [];

  if (!analysisResult || typeof analysisResult !== 'object') {
    return componentData;
  }

  try {
    // Handle different response formats
    if (Array.isArray(analysisResult)) {
      // Array format - iterate through results
      analysisResult.forEach(item => {
        componentData.push(...extractFromItem(requestId, item, filePath));
      });
    } else if (analysisResult.files) {
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
function extractFromItem(requestId: string, item: any, filePath?: string): ComponentData[] {
  const componentData: ComponentData[] = [];

  if (!item || typeof item !== 'object') {
    return componentData;
  }

  try {
    // Handle components array
    if (item.components && Array.isArray(item.components)) {
      item.components.forEach((component: any) => {
        if (component.props && Array.isArray(component.props)) {
          component.props.forEach((prop: any) => {
            componentData.push({
              id: crypto.randomUUID(),
              requestId,
              filePath: filePath || item.file || component.file || '',
              componentName: component.name || component.componentName || '',
              propName: prop.name || prop.propName || '',
              propValue: prop.value ? JSON.stringify(prop.value) : undefined,
              propType: prop.type || prop.propType || undefined,
              lineNumber: prop.line || prop.lineNumber || component.line || undefined,
              codeContext: prop.context || component.context || undefined,
              createdAt: new Date(),
            });
          });
        }
      });
    }

    // Handle direct props array
    if (item.props && Array.isArray(item.props)) {
      item.props.forEach((prop: any) => {
        componentData.push({
          id: crypto.randomUUID(),
          requestId,
          filePath: filePath || item.file || '',
          componentName: item.componentName || item.name || '',
          propName: prop.name || prop.propName || '',
          propValue: prop.value ? JSON.stringify(prop.value) : undefined,
          propType: prop.type || prop.propType || undefined,
          lineNumber: prop.line || prop.lineNumber || undefined,
          codeContext: prop.context || undefined,
          createdAt: new Date(),
        });
      });
    }

    // Handle single prop
    if (item.propName || item.name) {
      componentData.push({
        id: crypto.randomUUID(),
        requestId,
        filePath: filePath || item.file || '',
        componentName: item.componentName || '',
        propName: item.propName || item.name || '',
        propValue: item.value ? JSON.stringify(item.value) : undefined,
        propType: item.type || item.propType || undefined,
        lineNumber: item.line || item.lineNumber || undefined,
        codeContext: item.context || undefined,
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
export function sanitizeRequestParams(params: Record<string, any>): Record<string, any> {
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