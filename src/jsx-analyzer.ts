import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import type { NodePath } from '@babel/traverse';
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
  // Normalize babel-traverse default export once for reuse (avoid `any` cast)
  private readonly traverseDefault = ((traverse as unknown) as { default?: typeof traverse }).default ||
    traverse;

  /**
   * Extract component name from JSX identifier or member expression
   * Returns both full dotted name and local component name
   */
  private getJSXName(nameNode: t.JSXIdentifier | t.JSXMemberExpression): {
    full: string;
    local: string;
  } {
    if (t.isJSXIdentifier(nameNode)) {
      return { full: nameNode.name, local: nameNode.name };
    }

    const parts: string[] = [];
    let curr: t.JSXMemberExpression | t.JSXIdentifier = nameNode;

    while (t.isJSXMemberExpression(curr)) {
      if (t.isJSXIdentifier(curr.property)) {
        parts.unshift(curr.property.name);
      }
      if (t.isJSXIdentifier(curr.object)) {
        parts.unshift(curr.object.name);
        break;
      }
      curr = curr.object as t.JSXMemberExpression | t.JSXIdentifier;
    }

    const full = parts.join('.');
    const local = parts[parts.length - 1] ?? full;
    return { full, local };
  }

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
    return result.propUsages.filter((usage) => usage.propName === propName);
  }

  async getComponentProps(
    componentName: string,
    directory: string = '.'
  ): Promise<ComponentAnalysis[]> {
    const result = await this.analyzeProps(directory, componentName);
    return result.components.filter((comp) => comp.componentName === componentName);
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
    let totalInstances = 0;

    for (const file of files) {
      try {
        const result = await this.analyzeFileForMissingProp(file, componentName, requiredProp);
        missingPropUsages.push(...result.missingProps);
        totalInstances += result.totalInstances;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        console.error(`Error analyzing file ${file}:`, err.message);
      }
    }

    const missingPropCount = missingPropUsages.length;
    const missingPropPercentage =
      totalInstances > 0 ? (missingPropCount / totalInstances) * 100 : 0;

    return {
      missingPropUsages,
      summary: {
        totalInstances,
        missingPropCount,
        missingPropPercentage,
      },
    };
  }

  /**
   * Analyze a single file for missing required props
   */
  private async analyzeFileForMissingProp(
    file: string,
    componentName: string,
    requiredProp: string
  ): Promise<{
    missingProps: Array<{
      componentName: string;
      file: string;
      line: number;
      column: number;
      existingProps: string[];
    }>;
    totalInstances: number;
  }> {
    // Additional safety check for directories
    const fileStat = statSync(file);
    if (!fileStat.isFile()) {
      console.warn(`Skipping non-file: ${file}`);
      return { missingProps: [], totalInstances: 0 };
    }

    let content: string;
    try {
      content = readFileSync(file, 'utf-8');
    } catch (readError) {
      const re = readError instanceof Error ? readError : new Error(String(readError));
      // If reading a directory, skip
      // Some platforms include a `code` property on the error object
      // Use a safe check rather than typing the error as `any`.
      const maybeErr = re as unknown as NodeJS.ErrnoException;
      if (maybeErr.code === 'EISDIR') {
        console.warn(`Skipping directory (EISDIR): ${file}`);
        return { missingProps: [], totalInstances: 0 };
      }
      throw re;
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
      return { missingProps: [], totalInstances: 0 };
    }

    return this.traverseForMissingProps(ast, file, componentName, requiredProp);
  }

  /**
   * Traverse AST to find missing props
   */
  private traverseForMissingProps(
    ast: t.File,
    file: string,
    componentName: string,
    requiredProp: string
  ): {
    missingProps: Array<{
      componentName: string;
      file: string;
      line: number;
      column: number;
      existingProps: string[];
    }>;
    totalInstances: number;
  } {
    const missingProps: Array<{
      componentName: string;
      file: string;
      line: number;
      column: number;
      existingProps: string[];
    }> = [];
    let totalInstances = 0;

    const traverseDefault = this.traverseDefault;
    traverseDefault(ast, {
      JSXElement: (path: NodePath<t.JSXElement>) => {
        const openingElement = path.node.openingElement;
        if (
          !t.isJSXIdentifier(openingElement.name) &&
          !t.isJSXMemberExpression(openingElement.name)
        )
          return;

        const { full: fullName, local: localName } = this.getJSXName(
          openingElement.name as t.JSXIdentifier | t.JSXMemberExpression
        );
        if (!(fullName === componentName || localName === componentName)) return;

        // Count total instances
        totalInstances++;

        // Analyze props for this element
        const propAnalysis = this.analyzeElementProps(openingElement, requiredProp);

        if (!propAnalysis.hasRequiredProp) {
          const loc = openingElement.loc;
          missingProps.push({
            componentName: localName,
            file,
            line: loc?.start.line || 0,
            column: loc?.start.column || 0,
            existingProps: propAnalysis.existingProps,
          });
        }
      },
    });

    return { missingProps, totalInstances };
  }

  /**
   * Analyze props of a JSX element to check for required prop
   */
  private analyzeElementProps(
    openingElement: t.JSXOpeningElement,
    requiredProp: string
  ): {
    existingProps: string[];
    hasRequiredProp: boolean;
  } {
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

    return { existingProps, hasRequiredProp };
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
          nodir: true, // Explicitly exclude directories
        });

        // Double-check each file to ensure it's actually a file
        const validFiles: string[] = [];
        for (const file of files) {
          try {
            const fileStat = statSync(file);
            if (fileStat.isFile() && this.supportedExtensions.includes(extname(file))) {
              validFiles.push(file);
            }
          } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            console.warn(`Skipping invalid file: ${file}`, err.message);
          }
        }

        return validFiles;
      }

      return [];
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      throw new Error(`Cannot access path: ${path} - ${err.message}`);
    }
  }

  private async analyzeFile(
    filePath: string,
    targetComponent?: string,
    targetProp?: string,
    includeTypes: boolean = true
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
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.warn(`Cannot access file: ${filePath}`, err.message);
      return { components: [], propUsages: [] };
    }

    let content: string;
    try {
      content = readFileSync(filePath, 'utf-8');
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const maybeErr = err as unknown as NodeJS.ErrnoException;
      if (maybeErr.code === 'EISDIR') {
        console.warn(`Skipping directory (EISDIR): ${filePath}`);
        return { components: [], propUsages: [] };
      }
      throw new Error(`Failed to read file ${filePath}: ${err.message}`);
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
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to parse ${filePath}: ${msg}`);
    }

    // Track component definitions and their prop interfaces
    const componentInterfaces = new Map<string, string>();

    // Handle TypeScript/type and JSX traversal using normalized traverse
    const traverseDefault = this.traverseDefault;
    traverseDefault(ast, {
      // Handle TypeScript interfaces for props
      TSInterfaceDeclaration: (path: NodePath<t.TSInterfaceDeclaration>) => {
        if (!includeTypes) return;

        const interfaceName = path.node.id.name;
        if (interfaceName.endsWith('Props')) {
          const componentName = interfaceName.replace(/Props$/, '');
          componentInterfaces.set(componentName, interfaceName);
        }
      },

      // Handle TypeScript type aliases for props (e.g., type ButtonProps = {...})
      TSTypeAliasDeclaration: (path: NodePath<t.TSTypeAliasDeclaration>) => {
        if (!includeTypes) return;

        const aliasName = path.node.id.name;
        if (aliasName.endsWith('Props')) {
          const componentName = aliasName.replace(/Props$/, '');
          componentInterfaces.set(componentName, aliasName);
        }
      },

      // Handle function components
      FunctionDeclaration: (path: NodePath<t.FunctionDeclaration>) => {
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
          // Look for member access using the actual parameter name
          this.findPropsInFunctionBody(
            path,
            componentAnalysis,
            propUsages,
            targetProp,
            propsParam.name
          );
        } else if (propsParam && t.isObjectPattern(propsParam)) {
          // Direct destructuring in parameters
          this.analyzeObjectPattern(
            propsParam,
            functionName,
            filePath,
            componentAnalysis,
            propUsages,
            targetProp
          );
        }

        components.push(componentAnalysis);
      },

      // Handle arrow function components
      VariableDeclarator: (path: NodePath<t.VariableDeclarator>) => {
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
          this.analyzeObjectPattern(
            propsParam,
            componentName,
            filePath,
            componentAnalysis,
            propUsages,
            targetProp
          );
        } else if (propsParam && t.isIdentifier(propsParam)) {
          // Look for member access using the actual parameter name
          this.findPropsInFunctionBody(
            path,
            componentAnalysis,
            propUsages,
            targetProp,
            propsParam.name
          );
        }

        components.push(componentAnalysis);
      },

      // Handle JSX elements and their props
      JSXElement: (path: NodePath<t.JSXElement>) => {
        this.analyzeJSXElement(path, filePath, propUsages, targetComponent, targetProp);
      },
      JSXFragment: (path: NodePath<t.JSXFragment>) => {
        // Handle fragments that might contain JSX elements
        path.traverse({
          JSXElement: (innerPath: NodePath<t.JSXElement>) => {
            this.analyzeJSXElement(innerPath, filePath, propUsages, targetComponent, targetProp);
          },
        });
      },
    });

    return { components, propUsages };
  }

  private findPropsInFunctionBody(
    functionPath: NodePath<t.Node>,
    componentAnalysis: ComponentAnalysis,
    propUsages: PropUsage[],
    targetProp: string | undefined,
    paramName: string
  ) {
    functionPath.traverse({
      MemberExpression(path: NodePath<t.MemberExpression>) {
        if (
          t.isIdentifier(path.node.object) &&
          path.node.object.name === paramName &&
          t.isIdentifier(path.node.property)
        ) {
          const propName = (path.node.property as t.Identifier).name;
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
    path: NodePath<t.JSXElement>,
    filePath: string,
    propUsages: PropUsage[],
    targetComponent?: string,
    targetProp?: string
  ) {
    const openingElement = path.node.openingElement;

    // Support both simple identifiers and member expressions (e.g., UI.Select)
    if (!t.isJSXIdentifier(openingElement.name) && !t.isJSXMemberExpression(openingElement.name))
      return;

    const { full: fullName, local: localName } = this.getJSXName(
      openingElement.name as t.JSXIdentifier | t.JSXMemberExpression
    );

    if (targetComponent && !(targetComponent === fullName || targetComponent === localName)) return;

    const componentName = fullName;

    for (const attribute of openingElement.attributes) {
      if (t.isJSXAttribute(attribute) && t.isJSXIdentifier(attribute.name)) {
        const propName = attribute.name.name;
        if (targetProp && propName !== targetProp) continue;

        let value: string | undefined;
        if (attribute.value) {
          if (t.isStringLiteral(attribute.value)) {
            value = attribute.value.value;
          } else if (t.isJSXExpressionContainer(attribute.value)) {
            // Try to extract readable expression values for common cases
            const expression = attribute.value.expression as t.Expression | null;
            value = this.stringifyExpression(expression);
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

  /**
   * Attempt to produce a readable string for common expression node types.
   * Handles Identifier, MemberExpression, CallExpression, ArrowFunctionExpression,
   * TemplateLiteral and basic literals. Returns undefined when not representable.
   */
  private stringifyExpression(expression?: t.Expression | null): string | undefined {
    if (!expression) return undefined;

    if (t.isStringLiteral(expression)) return expression.value;
    if (t.isNumericLiteral(expression)) return String(expression.value);
    if (t.isBooleanLiteral(expression)) return String(expression.value);
    if (t.isNullLiteral(expression)) return 'null';

    if (t.isIdentifier(expression)) return expression.name;

    if (t.isMemberExpression(expression)) {
      const obj = this.stringifyExpression(expression.object as t.Expression | null);
      let prop: string | undefined;
      if (t.isIdentifier(expression.property) && !expression.computed) {
        prop = expression.property.name;
      } else if (expression.computed) {
        // Try to stringify computed property if it's a literal or identifier
        prop = this.stringifyExpression(expression.property as t.Expression | null);
        if (prop) prop = `[${prop}]`;
      }

      if (obj && prop) return `${obj}.${prop}`.replace(/\.\[/g, '[');
      if (obj && prop === undefined) return `${obj}.?`;
      return prop ?? obj;
    }

    if (t.isCallExpression(expression)) {
      const callee = this.stringifyExpression(expression.callee as t.Expression | null) || 'fn';
      const args = expression.arguments
        .map((a) => {
          if (t.isExpression(a)) return this.stringifyExpression(a) ?? '...';
          return '...';
        })
        .join(',');
      return `${callee}(${args})`;
    }

    if (t.isArrowFunctionExpression(expression)) {
      const params = expression.params
        .map((p) => {
          if (t.isIdentifier(p)) return p.name;
          return 'arg';
        })
        .join(',');
      return `(${params}) => …`;
    }

    if (t.isTemplateLiteral(expression)) {
      let out = '';
      expression.quasis.forEach((q, i) => {
        out += q.value.cooked ?? q.value.raw;
        if (i < expression.expressions.length) {
          const maybe = this.stringifyExpression(expression.expressions[i] as t.Expression | null);
          out += maybe ?? '${...}';
        }
      });
      return out;
    }

    if (t.isObjectExpression(expression)) return '{...}';
    if (t.isArrayExpression(expression)) return '[...]';

    return undefined;
  }
}
