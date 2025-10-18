import { parse } from "@babel/parser";
// @ts-ignore
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import { readFileSync, statSync } from "fs";
import { glob } from "glob";
import { join, extname } from "path";
import { asError, at, hasIndex, hasOwn, exhaustive } from "./utils/safety.js";
import { ParseError, AnalyzerError, FileSystemError } from "./types/safety.js";

export interface PropUsage {
  propName: string;
  componentName: string;
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

export type PropUsagesByFile = Record<string, PropUsage[]>;

export interface AnalysisResult {
  summary: {
    totalFiles: number;
    totalComponents: number;
    totalProps: number;
  };
  components: ComponentAnalysis[];
  propUsages: PropUsagesByFile;
}
function countGroupedPropUsages(grouped: PropUsagesByFile): number {
  const values = Object.values(grouped);
  return values.reduce((sum, arr) => sum + arr.length, 0);
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
    const propUsagesByFile: PropUsagesByFile = {};

    for (const file of files) {
      try {
        const analysis = await this.analyzeFile(
          file,
          componentName,
          propName,
          includeTypes,
        );
        components.push(...analysis.components);
        if (analysis.propUsages.length > 0) {
          propUsagesByFile[file] = analysis.propUsages;
        }
      } catch (error) {
        console.error(`Error analyzing file ${file}:`, error);
      }
    }

    return {
      summary: {
        totalFiles: files.length,
        totalComponents: components.length,
        totalProps: countGroupedPropUsages(propUsagesByFile),
      },
      components,
      propUsages: propUsagesByFile,
    };
  }

  async findPropUsage(
    propName: string,
    directory: string = ".",
    componentName?: string,
  ): Promise<AnalysisResult> {
    const result = await this.analyzeProps(directory, componentName, propName);
    const filtered: PropUsagesByFile = {};
    for (const [file, usages] of Object.entries(result.propUsages)) {
      const fileFiltered = usages.filter(
        (usage) => usage.propName === propName,
      );
      if (fileFiltered.length > 0) {
        filtered[file] = fileFiltered;
      }
    }
    result.propUsages = filtered;
    return result;
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
        let fileStat: import("fs").Stats;
        try {
          fileStat = statSync(file);
        } catch (statError: unknown) {
          const err = asError(statError, "FileStatError");
          console.warn(`Cannot stat file ${file}: ${err.message}`);
          continue;
        }

        if (!fileStat.isFile()) {
          console.warn(`Skipping non-file: ${file}`);
          continue;
        }

        let content: string;
        try {
          content = readFileSync(file, "utf-8");
        } catch (readError: unknown) {
          const err = asError(readError, "FileReadError");
          if (typeof readError === "object" && readError !== null && hasOwn(readError, "code") && (readError as Record<string, unknown>).code === "EISDIR") {
            console.warn(`Skipping directory (EISDIR): ${file}`);
            continue;
          }
          throw err;
        }

        let ast: t.File;

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
        } catch (error: unknown) {
          const err = asError(error, "ParseError");
          console.error(`Failed to parse ${file}:`, err.message);
          continue;
        }

        const traverseDefault: typeof traverse = traverse.default || traverse;
        traverseDefault(ast, {
          JSXElement: (path: unknown) => {
            if (typeof path !== "object" || path === null || !hasOwn(path, "node")) {
              return;
            }

            const node = (path as { node: unknown }).node;
            if (typeof node !== "object" || node === null || !hasOwn(node, "openingElement")) {
              return;
            }

            const nodeObj = node as Record<string, unknown>;
            const openingElement = nodeObj.openingElement as unknown;

            if (!t.isJSXOpeningElement(openingElement as any)) {
              return;
            }

            const name = ((openingElement as any).name) as unknown;
            if (!t.isJSXIdentifier(name as any)) return;

            const elementName = (name as t.JSXIdentifier).name;
            if (elementName !== componentName) return;

            // Get all props for this element
            const existingProps: string[] = [];
            let hasRequiredProp = false;

            const oeAny = openingElement as any;
            const attrs = (oeAny.attributes as unknown) as any[];
            if (Array.isArray(attrs)) {
              for (const attribute of attrs as any) {
                if (
                  t.isJSXAttribute(attribute as any) &&
                  t.isJSXIdentifier((attribute as any).name)
                ) {
                  const propName = attribute.name.name;
                  existingProps.push(propName);
                  if (propName === requiredProp) {
                    hasRequiredProp = true;
                  }
                } else if (t.isJSXSpreadAttribute(attribute as any)) {
                  existingProps.push("...spread");
                  // Note: We can't determine if spread contains the required prop
                  // Depending on the option, we may assume it provides the required prop
                  if (assumeSpreadHasRequiredProp) {
                    hasRequiredProp = true;
                  }
                }
              }
            }

            // If the required prop is missing, record this usage
            if (!hasRequiredProp) {
              const locVal = (oeAny.loc as unknown);
              const startLoc = locVal && typeof locVal === "object" && "start" in locVal ? (locVal as Record<string, unknown>).start : null;
              const line = startLoc && typeof startLoc === "object" && "line" in startLoc ? (startLoc as Record<string, unknown>).line : 0;
              const column = startLoc && typeof startLoc === "object" && "column" in startLoc ? (startLoc as Record<string, unknown>).column : 0;

              missingPropUsagesList.push({
                componentName: elementName,
                file,
                line: typeof line === "number" ? line : 0,
                column: typeof column === "number" ? column : 0,
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
          } catch (error: unknown) {
            const err = asError(error, "FileCheckError");
            console.warn(`Skipping invalid file: ${file}`, err.message);
          }
        }

        return validFiles;
      }

      return [];
    } catch (error: unknown) {
      const err = asError(error, "FileSystemError");
      throw new FileSystemError(`Cannot access path: ${path} - ${err.message}`);
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
    } catch (error: unknown) {
      const err = asError(error, "FileCheckError");
      console.warn(`Cannot access file: ${filePath}`, err.message);
      return { components: [], propUsages: [] };
    }

    let content: string;
    try {
      content = readFileSync(filePath, "utf-8");
    } catch (error: unknown) {
      const err = asError(error, "FileReadError");
      if (hasOwn(error as object, "code") && (error as Record<string, unknown>).code === "EISDIR") {
        console.warn(`Skipping directory (EISDIR): ${filePath}`);
        return { components: [], propUsages: [] };
      }
      throw new FileSystemError(`Failed to read file ${filePath}: ${err.message}`);
    }
    const components: ComponentAnalysis[] = [];
    const propUsages: PropUsage[] = [];

    let ast: t.File;
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
    } catch (error: unknown) {
      const err = asError(error, "ParseError");
      throw new ParseError(`Failed to parse ${filePath}: ${err.message}`);
    }

    // Track component definitions and their prop interfaces
    const componentInterfaces = new Map<string, string>();

    // Handle default export from traverse
    const traverseDefault: typeof traverse = traverse.default || traverse;
    traverseDefault(ast, {
      // Handle TypeScript interfaces for props
      TSInterfaceDeclaration: (path: unknown) => {
        if (!includeTypes) return;
        if (typeof path !== "object" || path === null || !hasOwn(path, "node")) return;

        const node = (path as { node: unknown }).node;
        if (typeof node !== "object" || node === null || !hasOwn(node, "id")) return;
        const id = (node as Record<string, unknown>).id;
        if (typeof id !== "object" || id === null || !hasOwn(id, "name")) return;
        const interfaceName = (id as Record<string, unknown>).name as string;

        if (interfaceName.endsWith("Props")) {
          const componentName = interfaceName.replace(/Props$/, "");
          componentInterfaces.set(componentName, interfaceName);
        }
      },

      // Handle function components
      FunctionDeclaration: (path: unknown) => {
        if (typeof path !== "object" || path === null || !hasOwn(path, "node")) return;
        const node = (path as { node: unknown }).node;
        if (typeof node !== "object" || node === null) return;
        const nodeObj = node as Record<string, unknown>;

        const id = nodeObj.id as unknown;
        const functionName = id && typeof id === "object" && hasOwn(id, "name") ? (id as Record<string, unknown>).name : undefined;
        if (typeof functionName !== "string") return;

        if (targetComponent && functionName !== targetComponent) return;

        const propsInterface = componentInterfaces.get(functionName);
        const componentAnalysis: ComponentAnalysis = {
          componentName: functionName,
          file: filePath,
          props: [],
          ...(propsInterface !== undefined ? { propsInterface } : {}),
        };

        // Analyze props parameter
        const params = (nodeObj.params as unknown);
        if (Array.isArray(params)) {
          const propsParam = at(params, 0);
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
        }

        components.push(componentAnalysis);
      },

      // Handle arrow function components
      VariableDeclarator: (path: unknown) => {
        if (typeof path !== "object" || path === null || !hasOwn(path, "node")) return;
        const node = (path as { node: unknown }).node;
        if (typeof node !== "object" || node === null) return;
        const nodeObj = node as Record<string, unknown>;

        const id = (nodeObj as any).id as unknown;
        if (!t.isIdentifier(id as any)) return;
        const init = (nodeObj as any).init as unknown;
        if (!t.isArrowFunctionExpression(init as any)) return;

        const componentName = (id as t.Identifier).name;
        if (targetComponent && componentName !== targetComponent) return;

        const arrowFunc = init as t.ArrowFunctionExpression;
        const propsInterface = componentInterfaces.get(componentName);
        const componentAnalysis: ComponentAnalysis = {
          componentName,
          file: filePath,
          props: [],
          ...(propsInterface !== undefined ? { propsInterface } : {}),
        };

        const propsParam = at(arrowFunc.params, 0);
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
      JSXElement: (path: unknown) => {
        this.analyzeJSXElement(
          path,
          filePath,
          propUsages,
          targetComponent,
          targetProp,
        );
      },
    });

    return { components, propUsages };
  }

  private findPropsInFunctionBody(
    functionPath: unknown,
    componentAnalysis: ComponentAnalysis,
    propUsages: PropUsage[],
    targetProp?: string,
  ): void {
    if (typeof functionPath !== "object" || functionPath === null || !hasOwn(functionPath, "traverse")) {
      return;
    }

    const fp = functionPath as { traverse: (v: object) => void };
    fp.traverse({
      MemberExpression(path: unknown) {
        if (typeof path !== "object" || path === null || !hasOwn(path, "node")) {
          return;
        }

        const node = (path as { node: unknown }).node;
        if (typeof node !== "object" || node === null) {
          return;
        }

        const nodeObj = node as Record<string, unknown>;
        if (
          hasOwn(nodeObj, "object") &&
          hasOwn(nodeObj, "property") &&
          t.isIdentifier(((nodeObj as any).object as unknown) as any, { name: "props" }) &&
          t.isIdentifier(((nodeObj as any).property as unknown) as any)
        ) {
          const property = nodeObj.property as t.Identifier;
          const propName = property.name;
          if (targetProp && propName !== targetProp) return;

          const loc = (nodeObj.loc as unknown);
          const startLine = loc && typeof loc === "object" && "start" in loc ? (loc as Record<string, unknown>).start : null;
          const line = startLine && typeof startLine === "object" && "line" in startLine ? (startLine as Record<string, unknown>).line : 0;
          const column = startLine && typeof startLine === "object" && "column" in startLine ? (startLine as Record<string, unknown>).column : 0;

          const propUsage: PropUsage = {
            propName,
            componentName: componentAnalysis.componentName,
            line: typeof line === "number" ? line : 0,
            column: typeof column === "number" ? column : 0,
          };

          componentAnalysis.props.push(propUsage);
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
  ): void {
    for (const property of pattern.properties) {
      if (t.isObjectProperty(property) && t.isIdentifier(property.key)) {
        const propName = property.key.name;
        if (targetProp && propName !== targetProp) continue;

        const locVal = property.loc as unknown;
        const startLoc = locVal && typeof locVal === "object" && "start" in locVal ? (locVal as Record<string, unknown>).start : null;
        const line = startLoc && typeof startLoc === "object" && "line" in startLoc ? (startLoc as Record<string, unknown>).line : 0;
        const column = startLoc && typeof startLoc === "object" && "column" in startLoc ? (startLoc as Record<string, unknown>).column : 0;

        const propUsage: PropUsage = {
          propName,
          componentName,
          line: typeof line === "number" ? line : 0,
          column: typeof column === "number" ? column : 0,
        };

        componentAnalysis.props.push(propUsage);
      } else if (t.isRestElement(property)) {
        const locVal = property.loc as unknown;
        const startLoc = locVal && typeof locVal === "object" && "start" in locVal ? (locVal as Record<string, unknown>).start : null;
        const line = startLoc && typeof startLoc === "object" && "line" in startLoc ? (startLoc as Record<string, unknown>).line : 0;
        const column = startLoc && typeof startLoc === "object" && "column" in startLoc ? (startLoc as Record<string, unknown>).column : 0;

        const propUsage: PropUsage = {
          propName: "...rest",
          componentName,
          line: typeof line === "number" ? line : 0,
          column: typeof column === "number" ? column : 0,
          isSpread: true,
        };

        componentAnalysis.props.push(propUsage);
      }
    }
  }

  private analyzeJSXElement(
    path: unknown,
    filePath: string,
    propUsages: PropUsage[],
    targetComponent?: string,
    targetProp?: string,
  ): void {
    if (typeof path !== "object" || path === null || !hasOwn(path, "node")) {
      return;
    }

    const node = (path as { node: unknown }).node;
    if (typeof node !== "object" || node === null || !hasOwn(node, "openingElement")) {
      return;
    }

    const nodeObj = node as Record<string, unknown>;
    const openingElement = nodeObj.openingElement as unknown;

    if (!t.isJSXOpeningElement(openingElement as any)) {
      return;
    }

    const name = (openingElement as any).name as unknown;
    if (!t.isJSXIdentifier(name as any)) return;

    const componentName = (name as t.JSXIdentifier).name;
    if (targetComponent && componentName !== targetComponent) return;

    const attributes = ((openingElement as any).attributes as unknown);
    if (!Array.isArray(attributes)) {
      return;
    }
    for (const attribute of attributes as any[]) {
      if (t.isJSXAttribute(attribute as any)) {
        const attr = attribute as any;
        const attrName = attr.name as unknown;
        if (!t.isJSXIdentifier(attrName as any)) continue;

        const propName = (attrName as t.JSXIdentifier).name;
        if (targetProp && propName !== targetProp) continue;

        let value: string | undefined;
        if (attr.value) {
          if (t.isStringLiteral(attr.value as any)) {
            value = (attr.value as any).value;
          } else if (t.isJSXExpressionContainer(attr.value as any)) {
            // Try to extract simple expression values
            const expression = (attr.value as any).expression as unknown;
            if (t.isStringLiteral(expression as any)) {
              value = (expression as t.StringLiteral).value;
            } else if (t.isNumericLiteral(expression as any)) {
              value = String((expression as t.NumericLiteral).value);
            } else if (t.isBooleanLiteral(expression as any)) {
              value = String((expression as t.BooleanLiteral).value);
            } else if (t.isIdentifier(expression as any)) {
              value = `{${(expression as t.Identifier).name}}`;
            }
          }
        }

        const loc = (attr.loc as unknown);
        const locObj = loc && typeof loc === "object" ? (loc as Record<string, any>) : null;
        const startObj = locObj?.start && typeof locObj.start === "object" ? (locObj.start as Record<string, any>) : null;
        const line = typeof startObj?.line === "number" ? startObj.line : 0;
        const column = typeof startObj?.column === "number" ? startObj.column : 0;

        const propUsage: PropUsage = {
          propName,
          componentName,
          line,
          column,
          ...(value !== undefined ? { value } : {}),
        };

        propUsages.push(propUsage);
      } else if (t.isJSXSpreadAttribute(attribute as any)) {
        const attr = attribute as any;
        const loc = (attr.loc as unknown);
        const locObj = loc && typeof loc === "object" ? (loc as Record<string, any>) : null;
        const startObj = locObj?.start && typeof locObj.start === "object" ? (locObj.start as Record<string, any>) : null;
        const line = typeof startObj?.line === "number" ? startObj.line : 0;
        const column = typeof startObj?.column === "number" ? startObj.column : 0;

        const propUsage: PropUsage = {
          propName: "...spread",
          componentName,
          line: typeof line === "number" ? line : 0,
          column: typeof column === "number" ? column : 0,
          isSpread: true,
        };

        propUsages.push(propUsage);
      }
    }
  }
}
