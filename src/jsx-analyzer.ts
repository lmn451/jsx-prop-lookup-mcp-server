import { parse } from '@babel/parser';
import * as traverse from '@babel/traverse';
import * as t from '@babel/types';
import { readFileSync, statSync } from 'fs';
import { glob } from 'glob';
import { join, extname } from 'path';

export interface PropUsage {
  propName: string;
  componentName: string;
  file: string;
  line: number;
  column: number;
  value?: string;
  isSpread?: boolean;
  type?: string;
  prettyPath?: string;
}

export interface ConcisePropUsage {
  name: string;
  line: number;
  col?: number;
  value?: string;
  spread?: boolean;
}

export interface MinimalPropUsage {
  component: string;
  file: string;
  line: number;
  prettyPath?: string;
}

export interface ComponentAnalysis {
  componentName: string;
  file: string;
  props: PropUsage[];
  propsInterface?: string;
  prettyPath?: string;
}

export interface ConciseComponentAnalysis {
  name: string;
  props: string[];
  interface?: string;
}

export interface AnalysisResult {
  summary: {
    totalFiles: number;
    totalComponents: number;
    totalProps: number;
  };
  components: ComponentAnalysis[];
  propUsages: PropUsage[];
}

export interface CompactAnalysisResult {
  summary: { files: number; components: number; props: number };
  files: {
    [filePath: string]: {
      components: ConciseComponentAnalysis[];
      usages: ConcisePropUsage[];
      prettyPath?: string;
    };
  };
}

export interface MinimalAnalysisResult {
  props: {
    [propName: string]: MinimalPropUsage[];
  };
}

export type ResponseFormat = 'full' | 'compact' | 'minimal';

export interface AnalysisOptions {
  format?: ResponseFormat;
  includeColumns?: boolean;
  includePrettyPaths?: boolean;
}

export interface PropCriterion {
  name: string;
  value?: string | number | boolean;
  operator?: 'equals' | 'contains';
  exists?: boolean;
}

export interface ComponentQueryOptions {
  directory?: string;
  logic?: 'AND' | 'OR';
  format?: ResponseFormat;
  includeColumns?: boolean;
  includePrettyPaths?: boolean;
}

export interface ComponentQuery {
  componentName: string;
  propCriteria: PropCriterion[];
  options?: ComponentQueryOptions;
}

export interface QueryResult {
  componentName: string;
  file: string;
  line: number;
  column?: number;
  prettyPath?: string;
  matchingProps: Record<string, {
    value: string | number | boolean;
    line: number;
    column?: number;
  }>;
  missingProps?: string[];
  allProps: Record<string, string | number | boolean>;
}

export interface ComponentQueryResult {
  query: ComponentQuery;
  results: QueryResult[];
  summary: {
    totalMatches: number;
    criteriaMatched: number;
    filesScanned: number;
  };
}

export class JSXPropAnalyzer {
  private readonly supportedExtensions = ['.js', '.jsx', '.ts', '.tsx'];
  private componentCache = new Map<string, ComponentAnalysis[]>();
  private propUsageCache = new Map<string, PropUsage[]>();

  private generatePrettyPath(filePath: string, line?: number, column?: number): string {
    // Generate VS Code compatible path for editor integration
    const normalizedPath = filePath.replace(/\\/g, '/');
    if (line !== undefined) {
      if (column !== undefined) {
        return `${normalizedPath}:${line}:${column}`;
      }
      return `${normalizedPath}:${line}`;
    }
    return normalizedPath;
  }

  async queryComponents(
    componentName: string,
    propCriteria: PropCriterion[],
    options: ComponentQueryOptions = {}
  ): Promise<ComponentQueryResult> {
    const {
      directory = '.',
      logic = 'AND',
      format = 'full',
      includeColumns = true,
      includePrettyPaths = false
    } = options;

    const query: ComponentQuery = { componentName, propCriteria, options };
    const results: QueryResult[] = [];
    let filesScanned = 0;

    // Get all components of the specified type
    const componentAnalysis = await this.getComponentProps(componentName, directory, { format: 'full' }) as ComponentAnalysis[];
    const allPropUsages = await this.analyzeProps(directory, componentName, undefined, true, { format: 'full' }) as AnalysisResult;
    
    filesScanned = new Set([
      ...componentAnalysis.map(c => c.file),
      ...allPropUsages.propUsages.map(u => u.file)
    ]).size;

    // Process component definitions and JSX usages together
    const processedComponents = new Set<string>();

    // Process component definitions
    componentAnalysis.forEach(comp => {
      const componentKey = `${comp.file}:${comp.componentName}:${comp.props[0]?.line || 0}`;
      if (processedComponents.has(componentKey)) return;
      processedComponents.add(componentKey);

      const componentProps = new Map<string, any>();
      comp.props.forEach(prop => {
        componentProps.set(prop.propName, {
          value: prop.value,
          line: prop.line,
          column: includeColumns ? prop.column : undefined
        });
      });

      const match = this.evaluatePropCriteria(componentProps, propCriteria, logic);
      if (match.matches) {
        results.push({
          componentName: comp.componentName,
          file: comp.file,
          line: comp.props[0]?.line || 0,
          column: includeColumns ? comp.props[0]?.column : undefined,
          ...(includePrettyPaths && { prettyPath: this.generatePrettyPath(comp.file, comp.props[0]?.line) }),
          matchingProps: match.matchingProps,
          missingProps: match.missingProps.length > 0 ? match.missingProps : undefined,
          allProps: Object.fromEntries(
            comp.props.map(p => [p.propName, p.value || ''])
          )
        });
      }
    });

    // Process JSX usages grouped by file and line to avoid duplicates
    const usageMap = new Map<string, PropUsage[]>();
    allPropUsages.propUsages.forEach(usage => {
      const key = `${usage.file}:${usage.line}`;
      if (!usageMap.has(key)) {
        usageMap.set(key, []);
      }
      usageMap.get(key)!.push(usage);
    });

    usageMap.forEach((usages, key) => {
      const [file, lineStr] = key.split(':');
      const line = parseInt(lineStr);
      const componentKey = `${file}:${componentName}:${line}`;
      
      if (processedComponents.has(componentKey)) return;
      processedComponents.add(componentKey);

      const usageProps = new Map<string, any>();
      usages.forEach(usage => {
        usageProps.set(usage.propName, {
          value: usage.value,
          line: usage.line,
          column: includeColumns ? usage.column : undefined
        });
      });

      const match = this.evaluatePropCriteria(usageProps, propCriteria, logic);
      if (match.matches) {
        results.push({
          componentName,
          file,
          line,
          column: includeColumns ? usages[0].column : undefined,
          ...(includePrettyPaths && { prettyPath: this.generatePrettyPath(file, line) }),
          matchingProps: match.matchingProps,
          missingProps: match.missingProps.length > 0 ? match.missingProps : undefined,
          allProps: Object.fromEntries(
            usages.map(u => [u.propName, u.value || ''])
          )
        });
      }
    });

    // Sort results by file path and line number
    results.sort((a, b) => {
      if (a.file !== b.file) {
        return a.file.localeCompare(b.file);
      }
      return a.line - b.line;
    });

    return {
      query,
      results,
      summary: {
        totalMatches: results.length,
        criteriaMatched: propCriteria.length,
        filesScanned
      }
    };
  }

  private evaluatePropCriteria(
    componentProps: Map<string, any>,
    criteria: PropCriterion[],
    logic: 'AND' | 'OR'
  ): {
    matches: boolean;
    matchingProps: Record<string, any>;
    missingProps: string[];
  } {
    const matchingProps: Record<string, any> = {};
    const missingProps: string[] = [];
    const results: boolean[] = [];

    for (const criterion of criteria) {
      const propData = componentProps.get(criterion.name);
      const propExists = propData !== undefined;
      let criterionMatches = false;

      if (criterion.exists !== undefined) {
        // Existence check
        criterionMatches = criterion.exists === propExists;
        if (!criterionMatches && criterion.exists) {
          missingProps.push(criterion.name);
        }
      } else if (criterion.value !== undefined && propExists) {
        // Value check
        const propValue = String(propData.value);
        const targetValue = String(criterion.value);
        
        if (criterion.operator === 'contains') {
          criterionMatches = propValue.includes(targetValue);
        } else {
          // Default to 'equals'
          criterionMatches = propValue === targetValue;
        }
      } else if (criterion.value !== undefined && !propExists) {
        // Value specified but prop doesn't exist
        criterionMatches = false;
        missingProps.push(criterion.name);
      } else {
        // No value specified, just check existence
        criterionMatches = propExists;
        if (!criterionMatches) {
          missingProps.push(criterion.name);
        }
      }

      if (criterionMatches && propExists) {
        matchingProps[criterion.name] = propData;
      }

      results.push(criterionMatches);
    }

    const matches = logic === 'AND' 
      ? results.every(r => r) 
      : results.some(r => r);

    return { matches, matchingProps, missingProps };
  }

  private transformToCompact(result: AnalysisResult, options: AnalysisOptions): CompactAnalysisResult {
    const files: CompactAnalysisResult['files'] = {};
    
    // Group by file
    const fileMap = new Map<string, { components: Set<string>; usages: ConcisePropUsage[] }>();
    
    // Process components
    result.components.forEach(comp => {
      if (!fileMap.has(comp.file)) {
        fileMap.set(comp.file, { components: new Set(), usages: [] });
      }
      fileMap.get(comp.file)!.components.add(comp.componentName);
    });
    
    // Process prop usages
    result.propUsages.forEach(usage => {
      if (!fileMap.has(usage.file)) {
        fileMap.set(usage.file, { components: new Set(), usages: [] });
      }
      
      const conciseUsage: ConcisePropUsage = {
        name: usage.propName,
        line: usage.line,
        ...(options.includeColumns && { col: usage.column }),
        ...(usage.value && { value: usage.value }),
        ...(usage.isSpread && { spread: usage.isSpread }),
      };
      
      fileMap.get(usage.file)!.usages.push(conciseUsage);
    });
    
    // Build final structure
    fileMap.forEach((data, filePath) => {
      const components: ConciseComponentAnalysis[] = Array.from(data.components).map(name => {
        const comp = result.components.find(c => c.componentName === name && c.file === filePath);
        return {
          name,
          props: comp?.props.map(p => p.propName) || [],
          ...(comp?.propsInterface && { interface: comp.propsInterface }),
        };
      });
      
      files[filePath] = {
        components,
        usages: data.usages,
        ...(options.includePrettyPaths && { prettyPath: this.generatePrettyPath(filePath) }),
      };
    });
    
    return {
      summary: {
        files: result.summary.totalFiles,
        components: result.summary.totalComponents,
        props: result.summary.totalProps,
      },
      files,
    };
  }

  private transformToMinimal(result: AnalysisResult, options: AnalysisOptions): MinimalAnalysisResult {
    const props: MinimalAnalysisResult['props'] = {};
    
    result.propUsages.forEach(usage => {
      if (!props[usage.propName]) {
        props[usage.propName] = [];
      }
      
      const minimalUsage: MinimalPropUsage = {
        component: usage.componentName,
        file: usage.file,
        line: usage.line,
        ...(options.includePrettyPaths && { 
          prettyPath: this.generatePrettyPath(usage.file, usage.line, options.includeColumns ? usage.column : undefined) 
        }),
      };
      
      props[usage.propName].push(minimalUsage);
    });
    
    return { props };
  }

  async analyzeProps(
    path: string,
    componentName?: string,
    propName?: string,
    includeTypes: boolean = true,
    options: AnalysisOptions = {}
  ): Promise<AnalysisResult | CompactAnalysisResult | MinimalAnalysisResult> {
    const {
      format = 'full',
      includeColumns = true,
      includePrettyPaths = false,
    } = options;

    const files = await this.getFiles(path);
    let successfullyAnalyzedFiles = 0;
    const components: ComponentAnalysis[] = [];
    const allPropUsages: PropUsage[] = [];

    for (const file of files) {
      try {
        const analysis = await this.analyzeFile(file, componentName, propName, includeTypes, options);
        components.push(...analysis.components);
        allPropUsages.push(...analysis.propUsages);
        successfullyAnalyzedFiles++;
      } catch (error) {
        console.error(`Error analyzing file ${file}:`, error);
        // Do not push components or propUsages for this file if it errors
      }
    }

    const fullResult: AnalysisResult = {
      summary: {
        totalFiles: successfullyAnalyzedFiles,
        totalComponents: components.length,
        totalProps: allPropUsages.length,
      },
      components,
      propUsages: allPropUsages,
    };

    // Transform based on format
    switch (format) {
      case 'compact':
        return this.transformToCompact(fullResult, options);
      case 'minimal':
        return this.transformToMinimal(fullResult, options);
      default:
        // Add prettyPath to full format if requested
        if (includePrettyPaths) {
          fullResult.components.forEach(comp => {
            comp.prettyPath = this.generatePrettyPath(comp.file);
          });
          fullResult.propUsages.forEach(usage => {
            usage.prettyPath = this.generatePrettyPath(
              usage.file, 
              usage.line, 
              includeColumns ? usage.column : undefined
            );
          });
        }
        return fullResult;
    }
  }

  async findPropUsage(
    propName: string,
    directory: string = '.',
    componentName?: string,
    options: AnalysisOptions = {}
  ): Promise<PropUsage[] | MinimalPropUsage[]> {
    const result = await this.analyzeProps(directory, componentName, propName, true, options);
    
    if (options.format === 'minimal') {
      const minimalResult = result as MinimalAnalysisResult;
      return minimalResult.props[propName] || [];
    }
    
    if (options.format === 'compact') {
      const compactResult = result as CompactAnalysisResult;
      const usages: PropUsage[] = [];
      Object.entries(compactResult.files).forEach(([filePath, fileData]) => {
        fileData.usages.forEach(usage => {
          if (usage.name === propName) {
            usages.push({
              propName: usage.name,
              componentName: '', // Will be filled from context
              file: filePath,
              line: usage.line,
              column: usage.col || 0,
              value: usage.value,
              isSpread: usage.spread,
              ...(options.includePrettyPaths && { prettyPath: fileData.prettyPath }),
            });
          }
        });
      });
      return usages;
    }
    
    const fullResult = result as AnalysisResult;
    return fullResult.propUsages.filter(usage => usage.propName === propName);
  }

  async getComponentProps(
    componentName: string,
    directory: string = '.',
    options: AnalysisOptions = {}
  ): Promise<ComponentAnalysis[] | ConciseComponentAnalysis[]> {
    const result = await this.analyzeProps(directory, componentName, undefined, true, options);
    
    if (options.format === 'compact') {
      const compactResult = result as CompactAnalysisResult;
      const components: ConciseComponentAnalysis[] = [];
      Object.values(compactResult.files).forEach(fileData => {
        components.push(...fileData.components.filter(comp => comp.name === componentName));
      });
      return components;
    }
    
    if (options.format === 'minimal') {
      // For minimal format, convert to concise format as it's more appropriate for component analysis
      const minimalResult = result as MinimalAnalysisResult;
      const componentProps = new Set<string>();
      Object.entries(minimalResult.props).forEach(([propName, usages]) => {
        if (usages.some(usage => usage.component === componentName)) {
          componentProps.add(propName);
        }
      });
      return [{
        name: componentName,
        props: Array.from(componentProps),
      }];
    }
    
    const fullResult = result as AnalysisResult;
    return fullResult.components.filter(comp => comp.componentName === componentName);
  }

  async findComponentsWithoutProp(
    componentName: string,
    requiredProp: string,
    directory: string = '.'
  ): Promise<{
    missingPropUsages: Array<{
      componentName: string;
      file: string;
      line: number;
      column: number;
      existingProps: string[];
    }>;
    summary: {
      totalInstances: number;
      missingPropCount: number;
      missingPropPercentage: number;
    };
  }> {
    const files = await this.getFiles(directory);
    const missingPropUsages: Array<{
      componentName: string;
      file: string;
      line: number;
      column: number;
      existingProps: string[];
    }> = [];

    for (const file of files) {
      try {
        // Additional safety check for directories
        const fileStat = statSync(file);
        if (!fileStat.isFile()) {
          console.warn(`Skipping non-file: ${file}`);
          continue;
        }

        let content: string;
        try {
          content = readFileSync(file, 'utf-8');
        } catch (readError: any) {
          if (readError.code === 'EISDIR') {
            console.warn(`Skipping directory (EISDIR): ${file}`);
            continue;
          }
          throw readError;
        }

        let ast;

        try {
          ast = parse(content, {
            sourceType: 'module',
            plugins: [
              'jsx',
              'typescript',
              'decorators-legacy',
              'classProperties',
              'objectRestSpread',
              'functionBind',
              'exportDefaultFrom',
              'exportNamespaceFrom',
              'dynamicImport',
              'nullishCoalescingOperator',
              'optionalChaining',
            ],
          });
        } catch (error) {
          console.error(`Failed to parse ${file}:`, error);
          continue;
        }

        const traverseDefault = traverse.default || traverse;
        traverseDefault(ast, {
          JSXElement: (path) => {
            const openingElement = path.node.openingElement;
            if (!t.isJSXIdentifier(openingElement.name)) return;

            const elementName = openingElement.name.name;
            if (elementName !== componentName) return;

            // Get all props for this element
            const existingProps: string[] = [];
            let hasRequiredProp = false;

            for (const attribute of openingElement.attributes) {
              if (t.isJSXAttribute(attribute) && t.isJSXIdentifier(attribute.name)) {
                const propName = attribute.name.name;
                existingProps.push(propName);
                if (propName === requiredProp) {
                  hasRequiredProp = true;
                }
              } else if (t.isJSXSpreadAttribute(attribute)) {
                existingProps.push('...spread');
                // Note: We can't determine if spread contains the required prop
                // so we'll assume it might and not flag this as missing
                hasRequiredProp = true;
              }
            }

            // If the required prop is missing, record this usage
            if (!hasRequiredProp) {
              const loc = openingElement.loc;
              missingPropUsages.push({
                componentName: elementName,
                file,
                line: loc?.start.line || 0,
                column: loc?.start.column || 0,
                existingProps,
              });
            }
          },
        });
      } catch (error) {
        console.error(`Error analyzing file ${file}:`, error);
      }
    }

    // Calculate summary statistics
    const totalInstances = missingPropUsages.length;
    const missingPropCount = missingPropUsages.length;
    const missingPropPercentage = totalInstances > 0 ? (missingPropCount / totalInstances) * 100 : 0;

    return {
      missingPropUsages,
      summary: {
        totalInstances,
        missingPropCount,
        missingPropPercentage,
      },
    };
  }

  private async getFiles(path: string): Promise<string[]> {
    try {
      const stat = statSync(path);

      if (stat.isFile()) {
        return this.supportedExtensions.includes(extname(path)) ? [path] : [];
      }

      if (stat.isDirectory()) {
        const pattern = join(path, '**/*.{js,jsx,ts,tsx}');
        const files = await glob(pattern, {
          ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
          nodir: true // Explicitly exclude directories
        });

        // Double-check each file to ensure it's actually a file
        const validFiles: string[] = [];
        for (const file of files) {
          try {
            const fileStat = statSync(file);
            if (fileStat.isFile() && this.supportedExtensions.includes(extname(file))) {
              validFiles.push(file);
            }
          } catch (error: any) {
            console.warn(`Skipping invalid file: ${file}`, error.message);
          }
        }

        return validFiles;
      }

      return [];
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        console.warn(`Path not found: ${path}. Returning empty array.`);
        return [];
      }
      throw new Error(`Cannot access path: ${path} - ${error.message}`);
    }
  }

  private async analyzeFile(
    filePath: string,
    targetComponent?: string,
    targetProp?: string,
    includeTypes: boolean = true,
    options: AnalysisOptions = {}
  ): Promise<{ components: ComponentAnalysis[]; propUsages: PropUsage[] }> {
    // Check if the path is actually a file and not a directory
    try {
      const stat = statSync(filePath);
      if (stat.isDirectory()) {
        console.warn(`Skipping directory: ${filePath}`);
        return { components: [], propUsages: [] };
      }
      if (!stat.isFile()) {
        console.warn(`Skipping non-file: ${filePath}`);
        return { components: [], propUsages: [] };
      }
    } catch (error: any) {
      console.warn(`Cannot access file: ${filePath}`, error);
      return { components: [], propUsages: [] };
    }

    let content: string;
    try {
      content = readFileSync(filePath, 'utf-8');
    } catch (error: any) {
      if (error.code === 'EISDIR') {
        console.warn(`Skipping directory (EISDIR): ${filePath}`);
        return { components: [], propUsages: [] };
      }
      throw new Error(`Failed to read file ${filePath}: ${error.message}`);
    }
    const components: ComponentAnalysis[] = [];
    const propUsages: PropUsage[] = [];

    let ast;
    try {
      ast = parse(content, {
        sourceType: 'module',
        plugins: [
          'jsx',
          'typescript',
          'decorators-legacy',
          'classProperties',
          'objectRestSpread',
          'functionBind',
          'exportDefaultFrom',
          'exportNamespaceFrom',
          'dynamicImport',
          'nullishCoalescingOperator',
          'optionalChaining',
        ],
      });
    } catch (error) {
      throw new Error(`Failed to parse ${filePath}: ${error}`);
    }

    // Track component definitions and their prop interfaces
    const componentInterfaces = new Map<string, string>();

    // Handle default export from traverse
    const traverseDefault = traverse.default || traverse;
    traverseDefault(ast, {
      // Handle TypeScript interfaces for props
      TSInterfaceDeclaration: (path) => {
        if (!includeTypes) return;

        const interfaceName = path.node.id.name;
        if (interfaceName.endsWith('Props')) {
          const componentName = interfaceName.replace(/Props$/, '');
          componentInterfaces.set(componentName, interfaceName);
        }
      },

      // Handle function components
      FunctionDeclaration: (path) => {
        const functionName = path.node.id?.name;
        if (!functionName) return;

        if (targetComponent && functionName !== targetComponent) return;

        const componentAnalysis: ComponentAnalysis = {
          componentName: functionName,
          file: filePath,
          props: [],
          propsInterface: componentInterfaces.get(functionName),
        };

        // Analyze props parameter
        const propsParam = path.node.params[0];
        if (propsParam && t.isIdentifier(propsParam)) {
          // Look for prop destructuring in function body
          this.findPropsInFunctionBody(path, componentAnalysis, propUsages, targetProp);
        } else if (propsParam && t.isObjectPattern(propsParam)) {
          // Direct destructuring in parameters
          this.analyzeObjectPattern(propsParam, functionName, filePath, componentAnalysis, propUsages, targetProp);
        }

        components.push(componentAnalysis);
      },

      // Handle arrow function components
      VariableDeclarator: (path) => {
        if (!t.isIdentifier(path.node.id) || !t.isArrowFunctionExpression(path.node.init)) {
          return;
        }

        const componentName = path.node.id.name;
        if (targetComponent && componentName !== targetComponent) return;

        const arrowFunc = path.node.init;
        const componentAnalysis: ComponentAnalysis = {
          componentName,
          file: filePath,
          props: [],
          propsInterface: componentInterfaces.get(componentName),
        };

        const propsParam = arrowFunc.params[0];
        if (propsParam && t.isObjectPattern(propsParam)) {
          this.analyzeObjectPattern(propsParam, componentName, filePath, componentAnalysis, propUsages, targetProp);
        }

        components.push(componentAnalysis);
      },

      // Handle JSX elements and their props
      JSXElement: (path) => {
        this.analyzeJSXElement(path, filePath, propUsages, targetComponent, targetProp);
      },

      JSXFragment: (path) => {
        // Handle fragments that might contain JSX elements
        path.traverse({
          JSXElement: (innerPath) => {
            this.analyzeJSXElement(innerPath, filePath, propUsages, targetComponent, targetProp);
          },
        });
      },
    });

    return { components, propUsages };
  }

  private findPropsInFunctionBody(
    functionPath: any,
    componentAnalysis: ComponentAnalysis,
    propUsages: PropUsage[],
    targetProp?: string
  ) {
    functionPath.traverse({
      MemberExpression(path: any) {
        if (
          t.isIdentifier(path.node.object, { name: 'props' }) &&
          t.isIdentifier(path.node.property)
        ) {
          const propName = path.node.property.name;
          if (targetProp && propName !== targetProp) return;

          const loc = path.node.loc;
          const propUsage: PropUsage = {
            propName,
            componentName: componentAnalysis.componentName,
            file: componentAnalysis.file,
            line: loc?.start.line || 0,
            column: loc?.start.column || 0,
          };

          componentAnalysis.props.push(propUsage);
          propUsages.push(propUsage);
        }
      },
    });
  }

  private analyzeObjectPattern(
    pattern: t.ObjectPattern,
    componentName: string,
    filePath: string,
    componentAnalysis: ComponentAnalysis,
    propUsages: PropUsage[],
    targetProp?: string
  ) {
    for (const property of pattern.properties) {
      if (t.isObjectProperty(property) && t.isIdentifier(property.key)) {
        const propName = property.key.name;
        if (targetProp && propName !== targetProp) continue;

        const loc = property.loc;
        const propUsage: PropUsage = {
          propName,
          componentName,
          file: filePath,
          line: loc?.start.line || 0,
          column: loc?.start.column || 0,
        };

        componentAnalysis.props.push(propUsage);
        propUsages.push(propUsage);
      } else if (t.isRestElement(property)) {
        const loc = property.loc;
        const propUsage: PropUsage = {
          propName: '...rest',
          componentName,
          file: filePath,
          line: loc?.start.line || 0,
          column: loc?.start.column || 0,
          isSpread: true,
        };

        componentAnalysis.props.push(propUsage);
        propUsages.push(propUsage);
      }
    }
  }

  private analyzeJSXElement(
    path: any,
    filePath: string,
    propUsages: PropUsage[],
    targetComponent?: string,
    targetProp?: string
  ) {
    const openingElement = path.node.openingElement;
    if (!t.isJSXIdentifier(openingElement.name)) return;

    const componentName = openingElement.name.name;
    if (targetComponent && componentName !== targetComponent) return;

    for (const attribute of openingElement.attributes) {
      if (t.isJSXAttribute(attribute) && t.isJSXIdentifier(attribute.name)) {
        const propName = attribute.name.name;
        if (targetProp && propName !== targetProp) continue;

        let value: string | undefined;
        if (attribute.value) {
          if (t.isStringLiteral(attribute.value)) {
            value = attribute.value.value;
          } else if (t.isJSXExpressionContainer(attribute.value)) {
            // Try to extract simple expression values
            const expression = attribute.value.expression;
            if (t.isStringLiteral(expression)) {
              value = expression.value;
            } else if (t.isNumericLiteral(expression)) {
              value = expression.value.toString();
            } else if (t.isBooleanLiteral(expression)) {
              value = expression.value.toString();
            } else if (t.isIdentifier(expression)) {
              value = `{${expression.name}}`;
            }
          }
        }

        const loc = attribute.loc;
        const propUsage: PropUsage = {
          propName,
          componentName,
          file: filePath,
          line: loc?.start.line || 0,
          column: loc?.start.column || 0,
          value,
        };

        propUsages.push(propUsage);
      } else if (t.isJSXSpreadAttribute(attribute)) {
        const loc = attribute.loc;
        const propUsage: PropUsage = {
          propName: '...spread',
          componentName,
          file: filePath,
          line: loc?.start.line || 0,
          column: loc?.start.column || 0,
          isSpread: true,
        };

        propUsages.push(propUsage);
      }
    }
  }
}
