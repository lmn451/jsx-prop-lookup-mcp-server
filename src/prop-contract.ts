import ts from 'typescript';
import type { JsxSnapshot } from './jsx-query.js';

/** Missing imported aliases and interface bases must not look like closed contracts. */
function hasMissingContractDependency(
  snapshot: JsxSnapshot,
  type: ts.Type,
  seen = new Set<ts.Node>()
): boolean {
  const { checker } = snapshot;
  const inspect = (node: ts.Node): boolean => {
    if (seen.has(node)) return false;
    seen.add(node);
    if (
      snapshot.program
        .getSemanticDiagnostics(node.getSourceFile())
        .some(
          (diagnostic) =>
            diagnostic.start !== undefined &&
            diagnostic.start >= node.getStart() &&
            diagnostic.start < node.end
        )
    )
      return true;
    let missing = false;
    const visit = (child: ts.Node): void => {
      if (ts.isTypeReferenceNode(child) || ts.isExpressionWithTypeArguments(child)) {
        let symbol = checker.getSymbolAtLocation(
          ts.isTypeReferenceNode(child) ? child.typeName : child.expression
        );
        if (symbol?.flags && symbol.flags & ts.SymbolFlags.Alias)
          symbol = checker.getAliasedSymbol(symbol);
        for (const declaration of symbol?.declarations ?? [])
          if (
            (ts.isInterfaceDeclaration(declaration) || ts.isTypeAliasDeclaration(declaration)) &&
            inspect(declaration)
          )
            missing = true;
      }
      ts.forEachChild(child, visit);
    };
    ts.forEachChild(node, visit);
    return missing;
  };
  return [
    ...(type.aliasSymbol?.declarations ?? []),
    ...(type.getSymbol()?.declarations ?? []),
  ].some(
    (node) =>
      (ts.isTypeAliasDeclaration(node) ||
        ts.isInterfaceDeclaration(node) ||
        ts.isTypeLiteralNode(node)) &&
      inspect(node)
  );
}

export type RestDestination = 'dom' | 'component' | 'discarded' | 'unknown';
export interface PropContract {
  names: Set<string>;
  open: boolean;
  forwarding?: RestDestination;
  uncertain?: string;
}

/** Only direct, symbol-bound rest forwarding is proven; other uses stay unknown. */
function restDestination(
  snapshot: JsxSnapshot,
  parameter: ts.ParameterDeclaration
): RestDestination | undefined {
  if (!ts.isObjectBindingPattern(parameter.name)) return undefined;
  const rest = parameter.name.elements.find((element) => element.dotDotDotToken);
  if (!rest || !ts.isIdentifier(rest.name)) return undefined;
  const symbol = snapshot.checker.getSymbolAtLocation(rest.name);
  const targets = new Set<RestDestination>();
  const visit = (node: ts.Node): void => {
    if (
      node !== rest.name &&
      ts.isIdentifier(node) &&
      snapshot.checker.getSymbolAtLocation(node) === symbol
    ) {
      if (ts.isJsxSpreadAttribute(node.parent) && node.parent.expression === node) {
        const tag = node.parent.parent.parent;
        if (ts.isJsxOpeningElement(tag) || ts.isJsxSelfClosingElement(tag))
          targets.add(
            ts.isIdentifier(tag.tagName) && /^[a-z]/.test(tag.tagName.text) ? 'dom' : 'component'
          );
      } else targets.add('unknown');
    }
    ts.forEachChild(node, visit);
  };
  visit(parameter.parent);
  if (targets.has('unknown')) return 'unknown';
  if (targets.has('component')) return 'component';
  return targets.has('dom') ? 'dom' : 'discarded';
}

/** Read callable/constructable contracts, including typed styled and React wrappers. */
export function getPropContract(snapshot: JsxSnapshot, tag: ts.JsxTagNameExpression): PropContract {
  const { checker } = snapshot;
  const type = checker.getTypeAtLocation(tag);
  const signatures = type.getCallSignatures();
  const contracts: ts.Type[] = [];
  let parameter: ts.ParameterDeclaration | undefined;
  let noParameter = false;
  for (const signature of signatures) {
    const props = signature.parameters[0];
    if (!props) {
      noParameter = true;
      continue;
    }
    const declaration = props.valueDeclaration ?? props.declarations?.[0];
    parameter ??= declaration && ts.isParameter(declaration) ? declaration : undefined;
    contracts.push(checker.getTypeOfSymbolAtLocation(props, declaration ?? tag));
  }
  if (!signatures.length) {
    for (const signature of type.getConstructSignatures()) {
      const instance = signature.getReturnType();
      const props = checker.getPropertyOfType(instance, 'props');
      if (props) contracts.push(checker.getTypeOfSymbolAtLocation(props, tag));
    }
  }
  const result: PropContract = { names: new Set(), open: false };
  if (!contracts.length && !noParameter) result.uncertain = 'No resolved prop contract found';
  const read = (part: ts.Type): void => {
    if (part.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown | ts.TypeFlags.TypeParameter)) {
      result.uncertain = 'Unresolved prop contract';
      return;
    }
    if (part.isUnion()) {
      part.types.forEach(read);
      return;
    }
    if (hasMissingContractDependency(snapshot, part))
      result.uncertain = 'Unresolved prop contract dependency';
    for (const prop of checker.getPropertiesOfType(part)) result.names.add(prop.name);
    if (checker.getIndexTypeOfType(part, ts.IndexKind.String)) result.open = true;
  };
  contracts.forEach(read);
  if (parameter) {
    result.forwarding = restDestination(snapshot, parameter);
    if (parameter.type) {
      const annotation = parameter.type;
      if (
        snapshot.program
          .getSemanticDiagnostics(annotation.getSourceFile())
          .some(
            (diagnostic) =>
              diagnostic.start !== undefined &&
              diagnostic.start >= annotation.getStart() &&
              diagnostic.start < annotation.end
          )
      )
        result.uncertain = 'Unresolved prop contract dependency';
    } else if (result.forwarding !== undefined) {
      // JavaScript destructured rest synthesizes an index signature even when discarded.
      result.open = result.forwarding === 'dom';
    }
    if (!parameter.type && (result.forwarding === 'component' || result.forwarding === 'unknown'))
      result.uncertain = 'Rest props have an unresolved forwarding destination';
  }
  return result;
}

export function suggestProp(prop: string, names: ReadonlySet<string>): string | undefined {
  const normalize = (name: string) => name.replace(/[-_]/g, '').toLowerCase();
  const candidates = [...names].filter((name) => normalize(name) === normalize(prop));
  return candidates.length === 1 ? candidates[0] : undefined;
}
