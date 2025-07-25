import { parse } from '@babel/parser';
// @ts-ignore
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import { readFileSync, statSync, existsSync } from 'fs';
import { glob } from 'glob';
import { join, extname, dirname, resolve, sep } from 'path';

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
  respectProjectBoundaries?: boolean;
  maxDepth?: number;
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
    private componentPropTypes = new Map<string, Map<string, string>>();
private readonly supportedExtensions = ['.js', '.jsx', '.ts', '.tsx'];

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
      includePrettyPaths = false,
      respectProjectBoundaries = false,
      maxDepth = Infinity,
    } = options;

    const query: ComponentQuery = { componentName, propCriteria, options };
    const results: QueryResult[] = [];
    let filesScanned = 0;

    // Get all components of the specified type
    const allAnalysis = await this.analyzeProps(directory, {
      componentName,
      format: 'full',
      includeTypes: true,
      respectProjectBoundaries,
      maxDepth,
    }) as AnalysisResult;
    const componentAnalysis = allAnalysis.components.filter(c => c.componentName === componentName);
    
    filesScanned = new Set([
      ...componentAnalysis.map(c => c.file),
      ...allAnalysis.propUsages.map(u => u.file)
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
    allAnalysis.propUsages.forEach(usage => {
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
    options: {
      componentName?: string;
      propName?: string;
      includeTypes?: boolean;
      format?: ResponseFormat;
      includeColumns?: boolean;
      includePrettyPaths?: boolean;
      respectProjectBoundaries?: boolean;
      maxDepth?: number;
    } = {}
  ): Promise<AnalysisResult | CompactAnalysisResult | MinimalAnalysisResult> {
    const {
      componentName,
      propName,
      includeTypes = true,
      format = 'full',
      includeColumns = true,
      includePrettyPaths = false,
      respectProjectBoundaries = false,
      maxDepth = Infinity,
    } = options;

    const files = await this.getFiles(path, { respectProjectBoundaries, maxDepth });
    let successfullyAnalyzedFiles = 0;
    const components: ComponentAnalysis[] = [];
    const allPropUsages: PropUsage[] = [];

    for (const file of files) {
      try {
        const analysis = await this.analyzeFile(file, {
          targetComponent: componentName,
          targetProp: propName,
          includeTypes,
          format,
          includeColumns,
          includePrettyPaths,
        });
        components.push(...analysis.components);
        allPropUsages.push(...analysis.propUsages);
        successfullyAnalyzedFiles++;
      } catch (error) {
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
        return this.transformToCompact(fullResult, { format, includeColumns, includePrettyPaths });
      case 'minimal':
        return this.transformToMinimal(fullResult, { format, includeColumns, includePrettyPaths });
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
  ): Promise<PropUsage[]> {
    const result = await this.analyzeProps(directory, {
      componentName,
      propName,
      includeTypes: true,
      format: options.format || 'full',
      includeColumns: options.includeColumns,
      includePrettyPaths: options.includePrettyPaths,
    });
    
    if (options.format === 'minimal') {
      const minimalResult = result as MinimalAnalysisResult;
      const minimalUsages = minimalResult.props[propName] || [];
      // Convert MinimalPropUsage to PropUsage
      return minimalUsages.map(usage => ({
        propName: propName,
        componentName: usage.component,
        file: usage.file,
        line: usage.line,
        column: 0, // MinimalPropUsage doesn't have column
        ...(usage.prettyPath && { prettyPath: usage.prettyPath }),
      }));
    }
    
    if (options.format === 'compact') {
      const compactResult = result as CompactAnalysisResult;
      const usages: PropUsage[] = [];
      Object.entries(compactResult.files).forEach(([filePath, fileData]) => {
        fileData.usages.forEach(usage => {
          if (usage.name === propName) {
            usages.push({
              propName: usage.name,
              componentName: componentName || '', // Will be filled from context
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

  
  private getNodeSourceText(node: t.Node, fileContent: string): string | undefined {
    if (node.start === null || node.end === null || node.start === undefined || node.end === undefined) {
        return undefined;
    }
    return fileContent.substring(node.start, node.end);
  }
  private async getFiles(path: string, options: { respectProjectBoundaries?: boolean; maxDepth?: number } = {}): Promise<string[]> {
    const { respectProjectBoundaries = true, maxDepth = 10 } = options;
    
    try {
      const stat = statSync(path);

      if (stat.isFile()) {
        return this.supportedExtensions.includes(extname(path)) ? [path] : [];
      }

      if (stat.isDirectory()) {
        // Resolve to absolute path for consistent boundary checking
        const absolutePath = resolve(path);
        
        // Find project boundaries if enabled
        let projectBoundaries: string[] = [];
        if (respectProjectBoundaries) {
          projectBoundaries = await this.findProjectBoundaries(absolutePath);
        }

        const pattern = join(path, '**/*.{js,jsx,ts,tsx}');
        const files = await glob(pattern, {
          ignore: [
            '**/node_modules/**', 
            '**/dist/**', 
            '**/build/**',
            '**/.git/**',
            '**/coverage/**',
            '**/tmp/**',
            '**/temp/**'
          ],
          nodir: true,
          maxDepth: maxDepth
        });

        // Filter files based on project boundaries
        const validFiles: string[] = [];
        for (const file of files) {
          try {
            const fileStat = statSync(file);
            if (fileStat.isFile() && this.supportedExtensions.includes(extname(file))) {
              // Check if file is within project boundaries
              if (respectProjectBoundaries && !this.isWithinProjectBoundaries(file, projectBoundaries, absolutePath)) {
                continue;
              }
              validFiles.push(file);
            }
          } catch (error: any) {
            // Skip invalid files
          }
        }

        return validFiles;
      }

      return [];
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // Path not found
        return [];
      }
      throw new Error(`Cannot access path: ${path} - ${error.message}`);
    }
  }

  private async findProjectBoundaries(startPath: string): Promise<string[]> {
    const boundaries: string[] = [];
    
    let currentPath = startPath;
    const maxLevels = 10; // Prevent infinite loops
    
    for (let i = 0; i < maxLevels; i++) {
      try {
        // Check for package.json (most common project boundary)
        if (existsSync(join(currentPath, 'package.json'))) {
          boundaries.push(currentPath);
        }
        
        // Check for .git directory
        if (existsSync(join(currentPath, '.git'))) {
          boundaries.push(currentPath);
        }
        
        // Check for other project markers
        const projectMarkers = [
          'tsconfig.json',
          'jsconfig.json',
          '.eslintrc.js',
          '.eslintrc.json',
          'webpack.config.js',
          'vite.config.js',
          'next.config.js',
          'gatsby-config.js'
        ];
        
        for (const marker of projectMarkers) {
          if (existsSync(join(currentPath, marker))) {
            boundaries.push(currentPath);
            break;
          }
        }
        
        const parentPath = dirname(currentPath);
        if (parentPath === currentPath) {
          // Reached root directory
          break;
        }
        currentPath = parentPath;
      } catch (error) {
        break;
      }
    }
    
    return [...new Set(boundaries)]; // Remove duplicates
  }

  private isWithinProjectBoundaries(filePath: string, boundaries: string[], searchPath: string): boolean {
    const absoluteFilePath = resolve(filePath);
    const absoluteSearchPath = resolve(searchPath);
    
    // If no boundaries found, allow files within the search path
    if (boundaries.length === 0) {
      return absoluteFilePath.startsWith(absoluteSearchPath);
    }
    
    // Check if file is within any of the project boundaries
    for (const boundary of boundaries) {
      const absoluteBoundary = resolve(boundary);
      if (absoluteFilePath.startsWith(absoluteBoundary)) {
        // Additional check: if we're searching from within a boundary,
        // only allow files from that specific boundary
        if (absoluteSearchPath.startsWith(absoluteBoundary)) {
          return true;
        }
        // If searching from outside, allow files from any boundary
        // but prefer the closest one to the search path
        const searchDepth = absoluteSearchPath.split(sep).length;
        const boundaryDepth = absoluteBoundary.split(sep).length;
        if (boundaryDepth >= searchDepth) {
          return true;
        }
      }
    }
    
    return false;
  }

  private async analyzeFile(
    filePath: string,
    options: {
      targetComponent?: string;
      targetProp?: string;
      includeTypes?: boolean;
      format: ResponseFormat;
      includeColumns?: boolean;
      includePrettyPaths?: boolean;
    }
  ): Promise<{ components: ComponentAnalysis[]; propUsages: PropUsage[] }> {
    const {
      targetComponent,
      targetProp,
      includeTypes = true,
      format = 'full',
      includeColumns = true,
      includePrettyPaths = false,
    } = options;

    // Check if the path is actually a file and not a directory
    try {
      const stat = statSync(filePath);
      if (stat.isDirectory()) {
        // Skip directories
        return { components: [], propUsages: [] };
      }
      if (!stat.isFile()) {
        // Skip non-files
        return { components: [], propUsages: [] };
      }
    } catch (error: any) {
      // Cannot access file
      return { components: [], propUsages: [] };
    }

    let content: string;
    try {
      content = readFileSync(filePath, 'utf-8');
    } catch (error: any) {
      if (error.code === 'EISDIR') {
        // Skip directories (EISDIR)
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
    const traverseDefault = (traverse as any).default || traverse;
    traverseDefault(ast, {
      // Handle TypeScript interfaces for props
      TSInterfaceDeclaration: (path) => {
        if (!includeTypes) return;

        const interfaceName = path.node.id.name;
                if (interfaceName.endsWith('Props')) {
          const componentName = interfaceName.replace(/Props$/, '');
          const propTypes = new Map<string, string>();
          path.get('body').get('body').forEach(propPath => {
            if (propPath.isTSPropertySignature() && propPath.node.key && t.isIdentifier(propPath.node.key)) {
              const propName = propPath.node.key.name;
              const propType = propPath.get('typeAnnotation').get('typeAnnotation');
              propTypes.set(propName, this.getNodeSourceText(propType.node, content) ?? 'any');
            }
          });
          this.componentPropTypes.set(componentName, propTypes);
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
        const propType = this.componentPropTypes.get(componentName)?.get(propName);
        if (propType) {
          propUsage.type = propType;
        }

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
