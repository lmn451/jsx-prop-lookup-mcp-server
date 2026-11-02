import * as babel from '@babel/parser';
import * as swcNext from '@swc-next/core';
import * as babelNext from 'babel-parser-next';
import { Buffer } from 'node:buffer';
import console from 'node:console';
import { readFileSync } from 'node:fs';
import { findPackageJSON } from 'node:module';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import * as oxc from 'oxc-parser';
import ts from 'typescript';
const rows = 1000;
const iterations = 25;
const source = Array.from(
  { length: rows },
  (_, i) =>
    `export const View${i} = ({label, ...rest}: {label: string; 'aria-label'?: string}) => <UI.Button {...rest} aria-label={label} disabled />;`
).join('\n');

function version(name) {
  try {
    const path = findPackageJSON(name, import.meta.url);
    return path ? JSON.parse(readFileSync(path, 'utf8')).version : 'unknown';
  } catch {
    return 'unknown';
  }
}

function countJsx(root) {
  let count = 0;
  const stack = [root];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== 'object' || typeof node.type !== 'string') continue;
    if (node.type === 'JSXElement') count++;
    for (const key of Object.keys(node)) {
      if (['parent', 'loc', 'comments', 'tokens', 'errors'].includes(key)) continue;
      const value = node[key];
      if (Array.isArray(value)) stack.push(...value);
      else if (value && typeof value === 'object' && typeof value.type === 'string')
        stack.push(value);
    }
  }
  return count;
}

function countTsJsx(root) {
  let count = 0;
  function visit(node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) count++;
    ts.forEachChild(node, visit);
  }
  visit(root);
  return count;
}

const backends = [
  {
    name: '@babel/parser',
    parse: () => babel.parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] }),
    count: countJsx,
  },
  {
    name: 'babel-parser-next',
    parse: () => babelNext.parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] }),
    count: countJsx,
  },
  {
    name: '@swc-next/core',
    parse: () => {
      const result = swcNext.parseSync(source, {
        lang: 'tsx',
        sourceType: 'module',
        semanticErrors: true,
      });
      if (result.diagnostics.some((d) => d.severity === 'error'))
        throw new Error('SWC Next parse errors');
      return result.program;
    },
    count: countJsx,
  },
  {
    name: 'oxc-parser',
    parse: () => {
      const result = oxc.parseSync('bench.tsx', source, { sourceType: 'module' });
      if (result.errors.length) throw new Error('Oxc parse errors');
      return result.program;
    },
    count: countJsx,
  },
  {
    name: 'typescript',
    parse: () => {
      const result = ts.createSourceFile(
        'bench.tsx',
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX
      );
      if (result.parseDiagnostics.length) throw new Error('TypeScript parse errors');
      return result;
    },
    count: countTsJsx,
  },
];

function measure(run) {
  for (let i = 0; i < 5; i++) run();
  const samples = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    run();
    samples.push(performance.now() - start);
  }
  return Number(samples.sort((a, b) => a - b)[Math.floor(samples.length / 2)].toFixed(3));
}

const results = backends.map((backend) => {
  const count = backend.count(backend.parse());
  if (count !== rows) throw new Error(`${backend.name}: expected ${rows} JSX nodes, got ${count}`);
  return {
    package: backend.name,
    version: version(backend.name),
    parseMedianMs: measure(backend.parse),
    parseAndWalkMedianMs: measure(() => {
      if (backend.count(backend.parse()) !== rows) throw new Error('JSX count mismatch');
    }),
    jsxCount: count,
  };
});
console.log(
  JSON.stringify(
    {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      sourceBytes: Buffer.byteLength(source),
      rows,
      iterations,
      scope:
        'Synthetic TSX parsing and full AST walk; no type checking, bindings, project I/O or server latency.',
      results,
    },
    null,
    2
  )
);
