import { parseSync, walk } from '@swc-next/core';
import ts from 'typescript';
import {
  createJsxMatch,
  getJsxOpeningNodes,
  type JsxMatch,
  type JsxSnapshot,
} from './jsx-query.js';

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
  parsedFiles: number;
  reusedFiles: number;
} {
  const matches: JsxMatch[] = [];
  const fallbackFiles: string[] = [];
  let parsedFiles = 0;
  let reusedFiles = 0;
  for (const source of snapshot.files) {
    let discovery = discoveryCache.get(source);
    if (discovery) {
      reusedFiles++;
    } else {
      parsedFiles++;
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
        // Keep TypeScript recovery authoritative when native discovery cannot run.
      }
      const nodes = offsets && openingNodes(source, offsets);
      discovery = { nodes: nodes ?? getJsxOpeningNodes(source), fallback: nodes === undefined };
      discoveryCache.set(source, discovery);
    }
    if (discovery.fallback) fallbackFiles.push(source.fileName);
    // Cache syntax only. Identities and values are projected against the fresh
    // Program/checker so changed imports/types and disappeared files stay visible.
    for (const node of discovery.nodes) matches.push(createJsxMatch(snapshot, source, node));
  }
  return { matches, unresolved: [...snapshot.unresolved], fallbackFiles, parsedFiles, reusedFiles };
}
const discoveryCache = new WeakMap<
  ts.SourceFile,
  { nodes: readonly (ts.JsxOpeningElement | ts.JsxSelfClosingElement)[]; fallback: boolean }
>();
