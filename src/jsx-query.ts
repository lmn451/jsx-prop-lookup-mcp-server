import ts from 'typescript';
import { ProjectWorkspace } from './project.js';
import { sourceSnippet, type UnresolvedCase } from './results.js';

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type PropValue =
  { status: 'known'; value: JsonValue } | { status: 'unknown'; expression: string };
export interface JsxIdentity {
  exportName: string;
  source: string;
  definition?: { filePath: string; name: string };
}
export interface JsxMatch {
  filePath: string;
  line: number;
  column: number;
  snippet: string;
  component: string;
  identity: JsxIdentity | null;
  props: Record<string, PropValue>;
  unknownSpreads: string[];
}
export interface JsxSnapshot {
  project: ProjectWorkspace;
  program: ts.Program;
  checker: ts.TypeChecker;
  files: readonly ts.SourceFile[];
  unresolved: UnresolvedCase[];
  resolveModule(specifier: string, fromFile: string): string | undefined;
}

/** Create a fresh query snapshot. Every compiler read uses the workspace boundary. */
export async function createJsxSnapshot(
  project: ProjectWorkspace,
  input = '.'
): Promise<JsxSnapshot> {
  const fileNames = await project.discover(input);
  const options: ts.CompilerOptions = {
    ...project.getCompilerOptions(),
    allowJs: true,
    // Stryker disable next-line BooleanLiteral: no default library is readable through this host, so enabling its probe cannot change query results.
    noLib: true,
    // Stryker disable next-line BooleanLiteral: this read-only snapshot never calls program.emit.
    noEmit: true,
    jsx: ts.JsxEmit.Preserve,
  };
  const read = (file: string) => {
    try {
      return project.readFile(file);
    } catch {
      // Unreadable or denied paths are unavailable to the compiler.
    }
    return undefined;
  };
  const host: ts.CompilerHost = {
    getSourceFile: (file, languageVersion) => {
      const source = read(file);
      return source === undefined
        ? undefined
        : // Stryker disable next-line BooleanLiteral: the program binder also sets parent links before query traversal.
          ts.createSourceFile(file, source, languageVersion, true);
    },
    // Stryker disable next-line StringLiteral: noLib prevents this required compiler-host callback from selecting a library.
    getDefaultLibFileName: () => '',
    writeFile: () => {},
    // Stryker disable next-line ArrowFunction: file names and workspace compiler paths are already absolute.
    getCurrentDirectory: () => project.root,
    getCanonicalFileName: (file) => file,
    // Stryker disable next-line ArrowFunction,BooleanLiteral: canonical path identity is supplied explicitly by getCanonicalFileName.
    useCaseSensitiveFileNames: () => true,
    // Stryker disable next-line ArrowFunction,StringLiteral: this required printer callback is unused by read-only AST queries.
    getNewLine: () => '\n',
    fileExists: (file) => read(file) !== undefined,
    readFile: read,
  };
  const resolveModule = (specifier: string, fromFile: string) => {
    const resolved = ts.resolveModuleName(specifier, fromFile, options, host).resolvedModule;
    // Stryker disable next-line ConditionalExpression: the catch below also returns undefined if an absent resolution is dereferenced.
    if (!resolved) return undefined;
    try {
      return project.resolve(resolved.resolvedFileName);
    } catch {
      // Unreadable or denied paths are unavailable to the compiler.
    }
    return undefined;
  };
  const program = ts.createProgram(fileNames, options, host);
  const unresolved: UnresolvedCase[] = [];
  const files = fileNames.flatMap((file) => {
    const source = program.getSourceFile(file);
    if (!source) unresolved.push({ filePath: file, reason: 'Cannot read source after discovery.' });
    return source ? [source] : [];
  });
  for (const source of files) {
    for (const statement of source.statements) {
      if (ts.isImportDeclaration(statement) && !ts.isStringLiteral(statement.moduleSpecifier)) {
        const position = source.getLineAndCharacterOfPosition(
          statement.moduleSpecifier.getStart(source)
        );
        unresolved.push({
          filePath: source.fileName,
          line: position.line + 1,
          column: position.character + 1,
          reason: 'Invalid import specifier: expected a string literal.',
        });
      }
    }
    for (const diagnostic of program.getSyntacticDiagnostics(source)) {
      const position = source.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
      unresolved.push({
        filePath: source.fileName,
        line: position.line + 1,
        column: position.character + 1,
        // Stryker disable next-line StringLiteral: syntactic diagnostics are flat strings, so the chain separator is unused.
        reason: `Parse error: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`,
      });
    }
  }
  return { project, program, checker: program.getTypeChecker(), files, unresolved, resolveModule };
}

function resolvedSymbol(checker: ts.TypeChecker, symbol: ts.Symbol): ts.Symbol {
  return symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
}

/** Import identities are attached to lexical symbols, never guessed from tag spelling. */
export function getComponentIdentity(
  snapshot: JsxSnapshot,
  tag: ts.JsxTagNameExpression
): JsxIdentity | null {
  const { checker } = snapshot;
  let base: ts.Node = tag;
  while (ts.isPropertyAccessExpression(base)) base = base.expression;
  const binding = checker.getSymbolAtLocation(base);
  const declaration = binding?.declarations?.[0];
  if (!declaration) return null;
  let module: ts.ImportDeclaration | ts.JSDocImportTag;
  let exportName: string;
  if (ts.isImportSpecifier(declaration)) {
    module = declaration.parent.parent.parent;
    exportName = declaration.propertyName?.text ?? declaration.name.text;
  } else if (ts.isImportClause(declaration)) {
    module = declaration.parent;
    exportName = 'default';
  } else if (ts.isNamespaceImport(declaration) && ts.isPropertyAccessExpression(tag)) {
    module = declaration.parent.parent;
    exportName = tag.name.text;
  } else {
    return null;
  }
  // Stryker disable next-line ConditionalExpression: non-string import specifiers have no value-space alias binding and were diagnosed in the snapshot.
  if (!ts.isStringLiteral(module.moduleSpecifier)) return null;
  const identity: JsxIdentity = { exportName, source: module.moduleSpecifier.text };
  const symbol = checker.getSymbolAtLocation(tag);
  const definition = symbol && resolvedSymbol(checker, symbol);
  const node = definition?.valueDeclaration;
  if (node) {
    identity.definition = { filePath: node.getSourceFile().fileName, name: definition!.name };
  }
  return identity;
}

function unwrap(node: ts.Expression): ts.Expression {
  while (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isSatisfiesExpression(node)
  )
    node = node.expression;
  return node;
}

/** Literal-only evaluation: analysis never evaluates application code. */
export function staticValue(expression: ts.Expression): PropValue {
  const node = unwrap(expression);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    return { status: 'known', value: node.text };
  if (ts.isNumericLiteral(node) && Number.isFinite(Number(node.text)))
    return { status: 'known', value: Number(node.text) };
  if (node.kind === ts.SyntaxKind.TrueKeyword) return { status: 'known', value: true };
  if (node.kind === ts.SyntaxKind.FalseKeyword) return { status: 'known', value: false };
  if (node.kind === ts.SyntaxKind.NullKeyword) return { status: 'known', value: null };
  if (
    ts.isPrefixUnaryExpression(node) &&
    ts.isNumericLiteral(node.operand) &&
    Number.isFinite(Number(node.operand.text))
  ) {
    if (node.operator === ts.SyntaxKind.MinusToken)
      return { status: 'known', value: -Number(node.operand.text) };
    if (node.operator === ts.SyntaxKind.PlusToken)
      return { status: 'known', value: Number(node.operand.text) };
  }
  if (ts.isArrayLiteralExpression(node)) {
    const values = node.elements.map((element) => staticValue(element));
    if (values.every((value) => value.status === 'known'))
      return { status: 'known', value: values.map((value) => value.value) };
  }
  if (ts.isObjectLiteralExpression(node)) {
    const result: Record<string, JsonValue> = Object.create(null);
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property))
        return { status: 'unknown', expression: expression.getText() };
      const key = propertyKey(property.name);
      if (key === '__proto__' && !ts.isComputedPropertyName(property.name))
        return { status: 'unknown', expression: expression.getText() };
      const value = staticValue(property.initializer);
      if (key === undefined || value.status === 'unknown')
        return { status: 'unknown', expression: expression.getText() };
      result[key] = value.value;
    }
    return { status: 'known', value: Object.fromEntries(Object.entries(result)) };
  }
  return { status: 'unknown', expression: expression.getText() };
}

function propertyKey(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name))
    return name.text;
  if (ts.isComputedPropertyName(name)) {
    const value = staticValue(name.expression);
    if (
      // Stryker disable next-line ConditionalExpression: unknown values have no value field, so both typeof alternatives reject them.
      value.status === 'known' &&
      (typeof value.value === 'string' || typeof value.value === 'number')
    )
      return String(value.value);
  }
  return undefined;
}

function childrenValue(children: ts.NodeArray<ts.JsxChild>): PropValue | undefined {
  const meaningful = children.filter((child) =>
    ts.isJsxText(child)
      ? // The parser omits empty JSX text nodes; inline whitespace is a child.
        child.text.trim() !== '' || !/[\r\n]/.test(child.text)
      : !ts.isJsxExpression(child) || child.expression !== undefined
  );
  if (meaningful.length === 0) return undefined;
  if (meaningful.length === 1) {
    const child = meaningful[0];
    if (ts.isJsxText(child)) {
      if (child.text.includes('&')) return { status: 'unknown', expression: child.text };
      const lines = child.text.replace(/\r/g, '').split('\n');
      const text = lines
        .map((line, index) => {
          let part = line.replace(/\t/g, ' ');
          if (index > 0) part = part.trimStart();
          if (index < lines.length - 1) part = part.trimEnd();
          return part;
        })
        .filter((line) => line.length > 0)
        .join(' ');
      return { status: 'known', value: text };
    }
    // Stryker disable next-line LogicalOperator: comment-only expressions were removed; other JSX child kinds have no expression field.
    if (ts.isJsxExpression(child) && child.expression) return staticValue(child.expression);
  }
  return { status: 'unknown', expression: meaningful.map((child) => child.getText()).join('') };
}

export function collectJsx(snapshot: JsxSnapshot): {
  matches: JsxMatch[];
  unresolved: UnresolvedCase[];
} {
  const matches: JsxMatch[] = [];
  const unresolved = [...snapshot.unresolved];
  for (const source of snapshot.files) {
    const visit = (node: ts.Node) => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const location = source.getLineAndCharacterOfPosition(node.getStart(source));
        const props: Record<string, PropValue> = Object.create(null);
        const unknownSpreads: string[] = [];
        for (const attribute of node.attributes.properties) {
          if (ts.isJsxAttribute(attribute)) {
            const initializer = attribute.initializer;
            props[attribute.name.getText(source)] = !initializer
              ? { status: 'known', value: true }
              : ts.isStringLiteral(initializer)
                ? initializer.text.includes('&')
                  ? { status: 'unknown', expression: initializer.getText(source) }
                  : { status: 'known', value: initializer.text }
                : ts.isJsxExpression(initializer) && initializer.expression
                  ? staticValue(initializer.expression)
                  : { status: 'unknown', expression: initializer.getText(source) };
          } else {
            const value = staticValue(attribute.expression);
            if (
              // Stryker disable next-line ConditionalExpression: unknown values have no value field and fail the object check below.
              value.status === 'known' &&
              value.value !== null &&
              typeof value.value === 'object' &&
              !Array.isArray(value.value)
            ) {
              for (const [key, propValue] of Object.entries(value.value))
                props[key] = { status: 'known', value: propValue };
            } else {
              const expression = attribute.expression.getText(source);
              unknownSpreads.push(expression);
              for (const key of Object.keys(props)) props[key] = { status: 'unknown', expression };
            }
          }
        }
        if (ts.isJsxOpeningElement(node) && ts.isJsxElement(node.parent)) {
          const children = childrenValue(node.parent.children);
          if (children) props.children = children;
        }
        matches.push({
          filePath: source.fileName,
          line: location.line + 1,
          column: location.character + 1,
          snippet: sourceSnippet(source.text, location.line + 1),
          component: node.tagName.getText(source),
          identity: getComponentIdentity(snapshot, node.tagName),
          props: Object.fromEntries(Object.entries(props)),
          unknownSpreads,
        });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return { matches, unresolved };
}
