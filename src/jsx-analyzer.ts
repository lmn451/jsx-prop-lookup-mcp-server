import { parse } from '@babel/parser';
// @ts-ignore
import traverse from '@babel/traverse';
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
}

export interface ComponentAnalysis {
  componentName: string;
  file: string;
  props: PropUsage[];
  propsInterface?: string;
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

export class JSXPropAnalyzer {
  private readonly supportedExtensions = ['.js', '.jsx', '.ts', '.tsx'];

  async analyzeProps(
    path: string,
    componentName?: string,
    propName?: string,
    includeTypes: boolean = true
  ): Promise<AnalysisResult> {
    const files = await this.getFiles(path);
    const components: ComponentAnalysis[] = [];
    const allPropUsages: PropUsage[] = [];

    for (const file of files) {
      try {
        const analysis = await this.analyzeFile(file, componentName, propName, includeTypes);
        components.push(...analysis.components);
        allPropUsages.push(...analysis.propUsages);
      } catch (error) {
        console.error(`Error analyzing file ${file}:`, error);
      }
    }

    return {
      summary: {
        totalFiles: files.length,
        totalComponents: components.length,
        totalProps: allPropUsages.length,
      },
      components,
      propUsages: allPropUsages,
    };
  }

  async findPropUsage(
    propName: string,
    directory: string = '.',
    componentName?: string
  ): Promise<PropUsage[]> {
    const result = await this.analyzeProps(directory, componentName, propName);
    return result.propUsages.filter(usage => usage.propName === propName);
  }

  async getComponentProps(
    componentName: string,
    directory: string = '.'
  ): Promise<ComponentAnalysis[]> {
    const result = await this.analyzeProps(directory, componentName);
    return result.components.filter(comp => comp.componentName === componentName);
  }

  private async getFiles(path: string): Promise<string[]> {
    try {
      const stat = statSync(path);
      
      if (stat.isFile()) {
        return this.supportedExtensions.includes(extname(path)) ? [path] : [];
      }
      
      if (stat.isDirectory()) {
        const pattern = join(path, '**/*.{js,jsx,ts,tsx}');
        return await glob(pattern, { ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'] });
      }
      
      return [];
    } catch (error) {
      throw new Error(`Cannot access path: ${path}`);
    }
  }

  private async analyzeFile(
    filePath: string,
    targetComponent?: string,
    targetProp?: string,
    includeTypes: boolean = true
  ): Promise<{ components: ComponentAnalysis[]; propUsages: PropUsage[] }> {
    const content = readFileSync(filePath, 'utf-8');
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