import { parse } from "@babel/parser";
// @ts-ignore
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import { readFileSync, statSync } from "fs";
import { glob } from "glob";
import { join, extname } from "path";

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
  private readonly supportedExtensions = [".js", ".jsx", ".ts", ".tsx"];

  async analyzeProps(
    path: string,
    componentName?: string,
    propName?: string,
    includeTypes: boolean = true,
  ): Promise<AnalysisResult> {
    const files = await this.getFiles(path);
    const components: ComponentAnalysis[] = [];
    const allPropUsages: PropUsage[] = [];

    for (const file of files) {
      try {
        const analysis = await this.analyzeFile(
          file,
          componentName,
          propName,
          includeTypes,
        );
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
    directory: string = ".",
    componentName?: string,
  ): Promise<{ [key: string]: PropUsage[] }> {
    const result = await this.analyzeProps(directory, componentName, propName);
    const filteredUsages = result.propUsages.filter(
      (usage) => usage.propName === propName,
    );

    const groupedByFile = filteredUsages.reduce(
      (acc, usage) => {
        const { file } = usage;
        if (!acc[file]) {
          acc[file] = [];
        }
        acc[file].push(usage);
        return acc;
      },
      {} as { [key: string]: PropUsage[] },
    );

    return groupedByFile;
  }

  async getComponentProps(
    componentName: string,
    directory: string = ".",
  ): Promise<{ [key: string]: ComponentAnalysis[] }> {
    const result = await this.analyzeProps(directory, componentName);
    const filteredComponents = result.components.filter(
      (comp) => comp.componentName === componentName,
    );

    const groupedByFile = filteredComponents.reduce(
      (acc, comp) => {
        const { file } = comp;
        if (!acc[file]) {
          acc[file] = [];
        }
        acc[file].push(comp);
        return acc;
      },
      {} as { [key: string]: ComponentAnalysis[] },
    );

    return groupedByFile;
  }

  async findComponentsWithoutProp(
    componentName: string,
    requiredProp: string,
    directory: string = ".",
    assumeSpreadHasRequiredProp: boolean = true,
  ): Promise<{
    missingPropUsages: {
      [key: string]: Array<{
        componentName: string;
        file: string;
        line: number;
        column: number;
        existingProps: string[];
      }>;
    };
    summary: {
      totalInstances: number;
      missingPropCount: number;
      missingPropPercentage: number;
    };
  }> {
    const files = await this.getFiles(directory);
    const missingPropUsagesList: Array<{
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
          content = readFileSync(file, "utf-8");
        } catch (readError: any) {
          if (readError.code === "EISDIR") {
            console.warn(`Skipping directory (EISDIR): ${file}`);
            continue;
          }
          throw readError;
        }

        let ast;

        try {
          ast = parse(content, {
            sourceType: "module",
            plugins: [
              "jsx",
              "typescript",
              "decorators-legacy",
              "classProperties",
              "objectRestSpread",
              "functionBind",
              "exportDefaultFrom",
              "exportNamespaceFrom",
              "dynamicImport",
              "nullishCoalescingOperator",
              "optionalChaining",
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
              if (
                t.isJSXAttribute(attribute) &&
                t.isJSXIdentifier(attribute.name)
              ) {
                const propName = attribute.name.name;
                existingProps.push(propName);
                if (propName === requiredProp) {
                  hasRequiredProp = true;
                }
              } else if (t.isJSXSpreadAttribute(attribute)) {
                existingProps.push("...spread");
                // Note: We can't determine if spread contains the required prop
                // Depending on the option, we may assume it provides the required prop
                if (assumeSpreadHasRequiredProp) {
                  hasRequiredProp = true;
                }
              }
            }

            // If the required prop is missing, record this usage
            if (!hasRequiredProp) {
              const loc = openingElement.loc;
              missingPropUsagesList.push({
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

    const groupedMissingProps = missingPropUsagesList.reduce(
      (acc, usage) => {
        const { file } = usage;
        if (!acc[file]) {
          acc[file] = [];
        }
        acc[file].push(usage);
        return acc;
      },
      {} as { [key: string]: Array<any> },
    );

    // Calculate summary statistics
    const totalInstances = missingPropUsagesList.length;
    const missingPropCount = missingPropUsagesList.length;
    const missingPropPercentage =
      totalInstances > 0 ? (missingPropCount / totalInstances) * 100 : 0;

    return {
      missingPropUsages: groupedMissingProps,
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
        const pattern = join(path, "**/*.{js,jsx,ts,tsx}");
        const files = await glob(pattern, {
          ignore: ["**/node_modules/**", "**/dist/**", "**/build/**"],
          nodir: true, // Explicitly exclude directories
        });

        // Double-check each file to ensure it's actually a file
        const validFiles: string[] = [];
        for (const file of files) {
          try {
            const fileStat = statSync(file);
            if (
              fileStat.isFile() &&
              this.supportedExtensions.includes(extname(file))
            ) {
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
      throw new Error(`Cannot access path: ${path} - ${error.message}`);
    }
  }

  private async analyzeFile(
    filePath: string,
    targetComponent?: string,
    targetProp?: string,
    includeTypes: boolean = true,
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
      content = readFileSync(filePath, "utf-8");
    } catch (error: any) {
      if (error.code === "EISDIR") {
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
        sourceType: "module",
        plugins: [
          "jsx",
          "typescript",
          "decorators-legacy",
          "classProperties",
          "objectRestSpread",
          "functionBind",
          "exportDefaultFrom",
          "exportNamespaceFrom",
          "dynamicImport",
          "nullishCoalescingOperator",
          "optionalChaining",
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
        if (interfaceName.endsWith("Props")) {
          const componentName = interfaceName.replace(/Props$/, "");
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
          this.findPropsInFunctionBody(
            path,
            componentAnalysis,
            propUsages,
            targetProp,
          );
        } else if (propsParam && t.isObjectPattern(propsParam)) {
          // Direct destructuring in parameters
          this.analyzeObjectPattern(
            propsParam,
            functionName,
            filePath,
            componentAnalysis,
            propUsages,
            targetProp,
          );
        }

        components.push(componentAnalysis);
      },

      // Handle arrow function components
      VariableDeclarator: (path) => {
        if (
          !t.isIdentifier(path.node.id) ||
          !t.isArrowFunctionExpression(path.node.init)
        ) {
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
            targetProp,
          );
        }

        components.push(componentAnalysis);
      },

      // Handle JSX elements and their props
      JSXElement: (path) => {
        this.analyzeJSXElement(
          path,
          filePath,
          propUsages,
          targetComponent,
          targetProp,
        );
      },

      JSXFragment: (path) => {
        // Handle fragments that might contain JSX elements
        path.traverse({
          JSXElement: (innerPath) => {
            this.analyzeJSXElement(
              innerPath,
              filePath,
              propUsages,
              targetComponent,
              targetProp,
            );
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
    targetProp?: string,
  ) {
    functionPath.traverse({
      MemberExpression(path: any) {
        if (
          t.isIdentifier(path.node.object, { name: "props" }) &&
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
    targetProp?: string,
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
          propName: "...rest",
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
    targetProp?: string,
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
          propName: "...spread",
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
