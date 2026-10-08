import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/server';
import ts from 'typescript';
import * as z from 'zod/v4';
import { ProjectWorkspace } from './project.js';
import { createJsxSnapshot, staticValue, type JsxSnapshot, type PropValue } from './jsx-query.js';
import {
  paginateResults,
  sourceSnippet,
  type LocatedResult,
  type PageOptions,
  type UnresolvedCase,
} from './results.js';

export interface InspectComponentQuery extends PageOptions {
  component: string;
  path?: string;
  source?: string;
}

export interface ComponentProp {
  name: string;
  type: string;
  required: boolean;
  default?: PropValue;
  description?: string;
  deprecated?: string | boolean;
}

export interface ComponentInspection extends LocatedResult {
  name: string;
  props: ComponentProp[];
  docs?: string;
}

type ComponentDeclaration = ts.FunctionDeclaration | ts.VariableDeclaration | ts.ClassDeclaration;
interface Candidate {
  node: ComponentDeclaration;
  symbol: ts.Symbol;
  names: Set<string>;
}

function canonical(checker: ts.TypeChecker, symbol: ts.Symbol): ts.Symbol {
  return symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
}

function collectCandidates(snapshot: JsxSnapshot): Candidate[] {
  const { checker } = snapshot;
  const candidates = new Map<ts.Symbol, Candidate>();
  for (const source of snapshot.program.getSourceFiles()) {
    const visit = (node: ts.Node): void => {
      if (
        (ts.isFunctionDeclaration(node) ||
          ts.isVariableDeclaration(node) ||
          ts.isClassDeclaration(node)) &&
        node.name &&
        ts.isIdentifier(node.name)
      ) {
        const symbol = checker.getSymbolAtLocation(node.name);
        if (symbol && (!ts.isFunctionDeclaration(node) || node.body || !candidates.has(symbol))) {
          candidates.set(symbol, {
            node,
            symbol,
            names: new Set([node.name.text]),
          });
        }
      } else if (
        (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
        !node.name &&
        node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)
      ) {
        const moduleSymbol = checker.getSymbolAtLocation(source);
        const defaultExport =
          moduleSymbol &&
          checker.getExportsOfModule(moduleSymbol).find((symbol) => symbol.name === 'default');
        if (defaultExport) {
          const symbol = canonical(checker, defaultExport);
          candidates.set(symbol, { node, symbol, names: new Set(['default']) });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  const bind = (symbol: ts.Symbol | undefined, name: string) => {
    if (!symbol) return;
    const candidate = candidates.get(canonical(checker, symbol));
    if (!candidate) return;
    candidate.names.add(name);
  };
  for (const source of snapshot.program.getSourceFiles()) {
    const moduleSymbol = checker.getSymbolAtLocation(source);
    if (moduleSymbol) {
      for (const symbol of checker.getExportsOfModule(moduleSymbol)) bind(symbol, symbol.name);
    }
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier))
        continue;
      const clause = statement.importClause;
      if (clause?.name) {
        const symbol = checker.getSymbolAtLocation(clause.name);
        bind(symbol, clause.name.text);
      }
      const bindings = clause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const item of bindings.elements) {
          const symbol = checker.getSymbolAtLocation(item.name);
          bind(symbol, item.name.text);
        }
      } else if (bindings && ts.isNamespaceImport(bindings)) {
        const symbol = checker.getSymbolAtLocation(bindings.name);
        if (symbol) {
          for (const item of checker.getExportsOfModule(canonical(checker, symbol))) {
            bind(item, `${bindings.name.text}.${item.name}`);
          }
        }
      }
    }
  }
  return [...candidates.values()];
}

function matchesSource(snapshot: JsxSnapshot, candidate: Candidate, source?: string): boolean {
  if (source === undefined) return true;
  const contexts = [
    join(snapshot.project.root, '__inspect__.tsx'),
    ...snapshot.files.map((file) => file.fileName),
  ];
  for (const context of contexts) {
    const filePath = snapshot.resolveModule(source, context);
    if (!filePath) continue;
    if (filePath === candidate.node.getSourceFile().fileName) return true;
    const module = snapshot.program.getSourceFile(filePath);
    const symbol = module && snapshot.checker.getSymbolAtLocation(module);
    if (
      symbol &&
      snapshot.checker
        .getExportsOfModule(symbol)
        .some((item) => canonical(snapshot.checker, item) === candidate.symbol)
    )
      return true;
  }
  return false;
}

function location(node: ts.Node): LocatedResult {
  const source = node.getSourceFile();
  const position = source.getLineAndCharacterOfPosition(node.getStart(source));
  return {
    filePath: source.fileName,
    line: position.line + 1,
    column: position.character + 1,
    snippet: sourceSnippet(source.text, position.line + 1, position.character + 1),
  };
}

function propertyName(name: ts.PropertyName | ts.BindingName): string | undefined {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)
    ? name.text
    : undefined;
}

function propertyTypeNode(declaration: ts.Declaration | undefined): ts.TypeNode | undefined {
  return declaration &&
    (ts.isPropertySignature(declaration) ||
      ts.isPropertyDeclaration(declaration) ||
      ts.isParameter(declaration) ||
      ts.isGetAccessorDeclaration(declaration))
    ? declaration.type
    : undefined;
}

function unwrapDefault(expression: ts.Expression): ts.Expression {
  while (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isTypeAssertionExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isNonNullExpression(expression)
  )
    expression = expression.expression;
  return expression;
}

function hasTypeErrors(snapshot: JsxSnapshot, node: ts.Node): boolean {
  return snapshot.program
    .getSemanticDiagnostics(node.getSourceFile())
    .some(
      (diagnostic) =>
        diagnostic.start !== undefined &&
        diagnostic.start >= node.getStart() &&
        diagnostic.start < node.end
    );
}

/** Follow type-only dependencies, including aliases and interface bases. */
function hasUnresolvedDependencies(
  snapshot: JsxSnapshot,
  node: ts.Node,
  includeTypeParameters = false
): boolean {
  const visited = new Set<ts.Node>();
  let unresolved = false;
  const inspect = (current: ts.Node): void => {
    if (visited.has(current)) return;
    visited.add(current);
    if (ts.isClassDeclaration(current)) {
      const inspectSignature = (child: ts.Node): void => {
        if (ts.isTypeNode(child)) inspect(child);
        else if (ts.isParameter(child) || ts.isTypeParameterDeclaration(child))
          ts.forEachChild(child, inspectSignature);
      };
      current.typeParameters?.forEach(inspectSignature);
      for (const heritage of current.heritageClauses ?? []) inspect(heritage);
      for (const member of current.members) {
        if (ts.getCombinedModifierFlags(member) & ts.ModifierFlags.Static) continue;
        ts.forEachChild(member, inspectSignature);
      }
      return;
    }
    if (hasTypeErrors(snapshot, current)) unresolved = true;
    const visit = (child: ts.Node): void => {
      if (ts.isTypeReferenceNode(child) || ts.isExpressionWithTypeArguments(child)) {
        const name = ts.isTypeReferenceNode(child) ? child.typeName : child.expression;
        const binding = snapshot.checker.getSymbolAtLocation(name);
        if (binding) {
          for (const declaration of binding.declarations ?? []) {
            let parent: ts.Node = declaration;
            while (!ts.isImportDeclaration(parent) && !ts.isSourceFile(parent))
              parent = parent.parent;
            if (ts.isImportDeclaration(parent) && hasTypeErrors(snapshot, parent))
              unresolved = true;
          }
          const symbol = canonical(snapshot.checker, binding);
          if (includeTypeParameters && symbol.flags & ts.SymbolFlags.TypeParameter)
            unresolved = true;
          for (const declaration of symbol.declarations ?? []) {
            if (
              ts.isTypeAliasDeclaration(declaration) ||
              ts.isInterfaceDeclaration(declaration) ||
              ts.isClassDeclaration(declaration)
            )
              inspect(declaration);
          }
        }
      }
      ts.forEachChild(child, visit);
    };
    visit(current);
  };
  inspect(node);
  return unresolved;
}

/** Inspect nested property and signature types without traversing application values. */
function hasUnresolvedType(
  snapshot: JsxSnapshot,
  type: ts.Type,
  at: ts.Node,
  visited = new Set<ts.Type>()
): boolean {
  const { checker } = snapshot;
  if (visited.has(type)) return false;
  visited.add(type);
  if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.TypeParameter))
    return true;
  if (type.isUnionOrIntersection())
    return type.types.some((part) => hasUnresolvedType(snapshot, part, at, visited));
  if (!(type.flags & ts.TypeFlags.Object)) return false;
  const check = (part: ts.Type, annotation?: ts.TypeNode) =>
    hasUnresolvedType(snapshot, part, at, visited) ||
    (annotation !== undefined &&
      checker.typeToString(part) === '{}' &&
      hasUnresolvedDependencies(snapshot, annotation, true));
  const checkSymbol = (symbol: ts.Symbol) =>
    check(
      checker.getTypeOfSymbolAtLocation(symbol, at),
      propertyTypeNode(symbol.valueDeclaration ?? symbol.declarations?.[0])
    );
  return (
    checker.getPropertiesOfType(type).some(checkSymbol) ||
    [...type.getCallSignatures(), ...type.getConstructSignatures()].some(
      (signature) =>
        signature.parameters.some(checkSymbol) ||
        check(signature.getReturnType(), signature.getDeclaration()?.type)
    ) ||
    checker.getIndexInfosOfType(type).some((index) => check(index.type, index.declaration?.type))
  );
}

function describeCandidate(
  snapshot: JsxSnapshot,
  candidate: Candidate,
  unresolved: UnresolvedCase[]
): ComponentInspection {
  const { checker } = snapshot;
  const { node, symbol } = candidate;
  const result: ComponentInspection = {
    ...location(node),
    name: node.name?.getText() ?? 'default',
    props: [],
  };
  const docs = ts.displayPartsToString(symbol.getDocumentationComment(checker));
  if (docs) result.docs = docs;
  const unknown = (reason: string, at: ts.Node = node) =>
    unresolved.push({ ...location(at), reason });
  const overloads = symbol.declarations?.filter(ts.isFunctionDeclaration) ?? [];
  if (overloads.length > 1 && overloads.every((overload) => !overload.body)) {
    unknown('Ambiguous overloaded component declaration has no implementation signature.');
    return result;
  }
  const defaults = new Map<string, PropValue>();
  const invalidateDefaults = (expression: string) => {
    for (const name of defaults.keys()) defaults.set(name, { status: 'unknown', expression });
  };
  const addDefault = (name: string, expression: ts.Expression) => {
    const value = staticValue(expression);
    defaults.set(name, value);
    if (value.status === 'unknown')
      unknown(`Unresolved default for prop ${name}: ${value.expression}`, expression);
  };
  const applyObjectDefaults = (expression: ts.ObjectLiteralExpression): void => {
    for (const property of expression.properties) {
      if (ts.isPropertyAssignment(property)) {
        const name = propertyName(property.name);
        if (name === '__proto__') {
          unknown(`Unresolved defaultProps prototype: ${property.getText()}`, property);
        } else if (name !== undefined) addDefault(name, property.initializer);
        else {
          invalidateDefaults(property.name.getText());
          unknown(`Unresolved defaultProps key: ${property.name.getText()}`, property);
        }
      } else {
        if (ts.isSpreadAssignment(property)) {
          const spread = unwrapDefault(property.expression);
          if (ts.isObjectLiteralExpression(spread)) {
            applyObjectDefaults(spread);
            continue;
          }
          invalidateDefaults(property.expression.getText());
        } else if (property.name) {
          const name = propertyName(property.name);
          if (name !== undefined)
            defaults.set(name, { status: 'unknown', expression: property.getText() });
          else invalidateDefaults(property.getText());
        }
        unknown(`Unresolved defaultProps member: ${property.getText()}`, property);
      }
    }
  };
  const objectDefaults = (expression: ts.Expression) => {
    defaults.clear();
    if (!ts.isObjectLiteralExpression(expression)) {
      unknown(`Unresolved defaultProps: ${expression.getText()}`, expression);
      return;
    }
    applyObjectDefaults(expression);
  };
  if (ts.isClassDeclaration(node)) {
    for (const member of node.members) {
      if (
        ts.isPropertyDeclaration(member) &&
        propertyName(member.name) === 'defaultProps' &&
        member.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword) &&
        member.initializer
      )
        objectDefaults(member.initializer);
    }
  }
  // Assignments are matched by lexical symbol, so a same-named component elsewhere
  // cannot contribute its defaults to this definition.
  let unorderedDefaultExpression: string | undefined;
  for (const source of snapshot.program.getSourceFiles()) {
    const visit = (current: ts.Node): void => {
      if (
        ts.isBinaryExpression(current) &&
        current.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isPropertyAccessExpression(current.left) &&
        current.left.name.text === 'defaultProps'
      ) {
        const target = checker.getSymbolAtLocation(current.left.expression);
        if (target && canonical(checker, target) === symbol) {
          if (source !== node.getSourceFile()) {
            unorderedDefaultExpression = current.right.getText();
            unknown(
              'defaultProps assignments outside the defining module cannot be statically ordered.',
              current
            );
          } else if (
            ts.isExpressionStatement(current.parent) &&
            ts.isSourceFile(current.parent.parent)
          )
            objectDefaults(current.right);
          else {
            invalidateDefaults(current.right.getText());
            unknown(
              'Conditional or nested defaultProps assignment cannot be resolved statically.',
              current
            );
          }
        }
      }
      ts.forEachChild(current, visit);
    };
    visit(source);
  }
  if (unorderedDefaultExpression !== undefined) invalidateDefaults(unorderedDefaultExpression);
  let propsType: ts.Type | undefined;
  let parameter: ts.ParameterDeclaration | undefined;
  let typeNode: ts.TypeNode | undefined;
  if (ts.isFunctionDeclaration(node)) parameter = node.parameters[0];
  else if (ts.isVariableDeclaration(node)) {
    if (
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    )
      parameter = node.initializer.parameters[0];
    else
      unknown(
        `Unresolved component wrapper or value: ${node.initializer?.getText() ?? node.getText()}`
      );
    if (
      node.type &&
      ts.isTypeReferenceNode(node.type) &&
      /(?:^|\.)(?:FC|FunctionComponent)$/.test(node.type.typeName.getText())
    )
      typeNode = node.type.typeArguments?.[0];
    else if (node.type && ts.isFunctionTypeNode(node.type))
      typeNode = node.type.parameters[0]?.type;
  } else {
    const base = node.heritageClauses?.find(
      (clause) => clause.token === ts.SyntaxKind.ExtendsKeyword
    )?.types[0];
    if (base && /(?:^|\.)(?:Component|PureComponent)$/.test(base.expression.getText()))
      typeNode = base.typeArguments?.[0];
    if (!typeNode) unknown('Unresolved class component props type.');
  }
  typeNode = parameter?.type ?? typeNode;
  if (typeNode) propsType = checker.getTypeFromTypeNode(typeNode);
  else if (parameter) propsType = checker.getTypeAtLocation(parameter);
  if (parameter && ts.isObjectBindingPattern(parameter.name)) {
    for (const element of parameter.name.elements) {
      const name = propertyName(element.propertyName ?? element.name);
      if (name !== undefined && element.initializer) addDefault(name, element.initializer);
      else if (element.initializer)
        unknown(
          `Unresolved destructured default key: ${(element.propertyName ?? element.name).getText()}`,
          element
        );
    }
  }
  if (propsType) {
    const issueCount = unresolved.length;
    if (
      propsType.flags &
      (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.TypeParameter | ts.TypeFlags.Union)
    ) {
      unknown(
        `Unresolved props type: ${typeNode?.getText() ?? checker.typeToString(propsType)}.`,
        typeNode ?? parameter
      );
    } else {
      for (const prop of checker.getPropertiesOfType(propsType)) {
        const declaration = prop.valueDeclaration ?? prop.declarations?.[0] ?? node;
        const propType = checker.getTypeOfSymbolAtLocation(prop, declaration);
        const declaredTypeNode = propertyTypeNode(declaration);
        const declaredType = declaredTypeNode?.getText();
        const resolvedType = checker.typeToString(
          propType,
          declaration,
          ts.TypeFormatFlags.NoTruncation
        );
        const item: ComponentProp = {
          name: prop.name,
          type:
            declaredType && (propType.flags & ts.TypeFlags.Any || resolvedType === '{}')
              ? declaredType
              : resolvedType,
          required: !(prop.flags & ts.SymbolFlags.Optional),
        };
        const description = ts.displayPartsToString(prop.getDocumentationComment(checker));
        if (description) item.description = description;
        const deprecated = prop.getJsDocTags(checker).find((tag) => tag.name === 'deprecated');
        if (deprecated) item.deprecated = ts.displayPartsToString(deprecated.text) || true;
        if (defaults.has(prop.name)) item.default = defaults.get(prop.name);
        if (
          hasUnresolvedType(snapshot, propType, declaration) ||
          (declaredTypeNode &&
            hasUnresolvedDependencies(snapshot, declaredTypeNode, resolvedType === '{}')) ||
          (prop.declarations ?? []).some((part) => hasTypeErrors(snapshot, part))
        )
          unknown(`Unresolved type for prop ${prop.name}: ${item.type}.`, declaration);
        result.props.push(item);
      }
    }
    if (
      unresolved.length === issueCount &&
      typeNode &&
      hasUnresolvedDependencies(snapshot, typeNode)
    )
      unknown(`Unresolved props dependency: ${typeNode.getText()}.`, typeNode);
  }
  for (const [name, value] of defaults) {
    if (!result.props.some((prop) => prop.name === name)) {
      result.props.push({ name, type: 'unknown', required: false, default: value });
      unknown(`Default for prop ${name} has no resolved declaration.`);
    }
  }
  return result;
}

/** Inspect component definitions and declared props without evaluating project code. */
export async function inspectComponent(project: ProjectWorkspace, query: InspectComponentQuery) {
  if (!query.component.trim()) throw new Error('component must be a non-empty string');
  const snapshot = await createJsxSnapshot(project, query.path);
  const unresolved = [...snapshot.unresolved];
  const matches = collectCandidates(snapshot)
    .filter(
      (candidate) =>
        candidate.names.has(query.component) && matchesSource(snapshot, candidate, query.source)
    )
    .map((candidate) => describeCandidate(snapshot, candidate, unresolved));
  if (matches.length === 0)
    unresolved.push({
      filePath: project.resolve(query.path ?? '.'),
      reason: `Component ${query.component} not found${query.source ? ` from ${query.source}` : ''}.`,
    });
  return paginateResults(matches, query, unresolved);
}

export function registerInspectComponentTool(server: McpServer, project: ProjectWorkspace): void {
  server.registerTool(
    'inspect_component',
    {
      title: 'Inspect component',
      description:
        'Inspect component definitions, declared prop types, docs, and statically known defaults. Resolves imported aliases and reports unknown information explicitly.',
      inputSchema: z.object({
        component: z
          .string()
          .min(1)
          .describe('Component name, local import alias, or original export name.'),
        path: z.string().default('.').describe('Project file or directory to inspect.'),
        source: z
          .string()
          .optional()
          .describe('Import specifier or securely resolvable local module.'),
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(500).default(100),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async (query) => {
      const result = await inspectComponent(project, query);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        structuredContent: result,
      };
    }
  );
}
