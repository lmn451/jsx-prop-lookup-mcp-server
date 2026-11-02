import { parseSync, walk } from '@swc-next/core';
import ts from 'typescript';
import { collectJsx, createJsxMatch, type JsxMatch, type JsxSnapshot } from './jsx-query.js';

/** Locate semantic nodes without a second complete TypeScript AST walk. */
function openingNodes(source: ts.SourceFile, offsets: readonly number[]) {
  const children = new WeakMap<ts.Node, ts.Node[]>();
  const nodes: Array<ts.JsxOpeningElement | ts.JsxSelfClosingElement> = [];
  for (const offset of offsets) {
    let current: ts.Node = source;
    for (;;) {
      if (
        (ts.isJsxOpeningElement(current) || ts.isJsxSelfClosingElement(current)) &&
        current.getStart(source) === offset
      ) {
        nodes.push(current);
        break;
      }
      let entries = children.get(current);
      if (!entries) {
        const directChildren: ts.Node[] = [];
        ts.forEachChild(current, (child) => {
          directChildren.push(child);
        });
        entries = directChildren;
        children.set(current, entries);
      }
      // forEachChild yields direct children in source order. Cache and binary-search
      // them so many JSX tags in one module do not rescan all its statements.
      let low = 0;
      let high = entries.length;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        if (entries[middle].pos <= offset) low = middle + 1;
        else high = middle;
      }
      const child = entries[low - 1];
      if (!child || offset >= child.end) return undefined;
      current = child;
    }
  }
  return nodes;
}

/** Experimental syntax discovery only: TypeScript remains the semantic authority. */
export function collectJsxWithSwc(snapshot: JsxSnapshot): {
  matches: JsxMatch[];
  unresolved: JsxSnapshot['unresolved'];
  fallbackFiles: string[];
} {
  const matches: JsxMatch[] = [];
  const fallbackFiles: string[] = [];
  for (const source of snapshot.files) {
    let offsets: number[] | undefined;
    try {
      const lang = source.isDeclarationFile
        ? 'dts'
        : /\.tsx$/i.test(source.fileName)
          ? 'tsx'
          : /\.ts$/i.test(source.fileName)
            ? 'ts'
            : 'jsx';
      const parsed = parseSync(source.text, {
        lang,
        sourceType: 'module',
        semanticErrors: true,
        errorRecovery: true,
      });
      if (!parsed.diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
        const found: number[] = [];
        walk(parsed.program, {
          JSXOpeningElement(node) {
            if (typeof node.start !== 'number') throw new Error('Missing JSX source offset.');
            found.push(node.start);
          },
        });
        offsets = found;
      }
    } catch {
      // Native parser/walker failures must not hide valid TypeScript recovery results.
    }
    const nodes = offsets && openingNodes(source, offsets);
    if (!nodes) {
      fallbackFiles.push(source.fileName);
      matches.push(...collectJsx({ ...snapshot, files: [source], unresolved: [] }).matches);
    } else {
      for (const node of nodes) matches.push(createJsxMatch(snapshot, source, node));
    }
  }
  return { matches, unresolved: [...snapshot.unresolved], fallbackFiles };
}
