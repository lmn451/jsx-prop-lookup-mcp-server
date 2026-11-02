# AST modernization research

As of 2026-11-02. Registry versions and official upstream documentation were checked; measurements below are local, not upstream marketing numbers.

## Findings

- **SWC Next 0.5.0 is the strongest syntax-scan candidate.** It has a flat ESTree-based Rust representation and a JavaScript-facing decoding/walking API, TSX parsing, diagnostics, walkers, and printing APIs. Rspack 2.3.0 explicitly migrated its JavaScript parser to SWC Next (PR #16089). The README claims up to 3x native and 10x JavaScript-API speedups versus SWC; these are not claims about this server. Its API is not compatible with the old SWC API. The Rust API has explicit early-stage/soundness warnings: do not treat Rspack adoption as proof that every public API is mature.
- **Babel 8.1.0 is the lower-risk modernization path for the legacy analyzer.** It is ESM-only, ships its own TypeScript types, and requires Node ^22.18.0 or >=24.11.0. A migration would remove the Babel default-export normalization and the separate traverse typings, but still requires parser/node-shape and binding regression checks. This benchmark does not show a meaningful parsing-speed win over Babel 7.
- **Oxc parser 0.156.0 is another credible Rust option.** Its JavaScript binding exposes a program, visitor keys, a Visitor API, diagnostics, and module import/export information. Do not confuse its JavaScript-facing types with its internal Rust AST. It was slower in this particular eager-program/full-walk test; that is not a general ranking of the native parsers.
- **Do not blindly update the embedded TypeScript dependency to 7.0.2.** The official TypeScript 7 announcement says 7.0 does not ship the JavaScript Compiler API; 7.1 is expected to introduce a different API. Our default tools call createProgram, use the TypeChecker, and resolve imports/types. Keep the working 5.9.3 API pinned while evaluating the TypeScript 6 compatibility package separately. Faster native tsc is a separate build-tool decision.
- **Other registry updates:** MCP client/server 2.4.0 and classic @swc/core 1.16.21 were available. They are not substitutes for a measured parser migration. Runtime glob and Zod were patched in the 4.0.0 release; its production dependency audit was clean.

## Local benchmark

Node v26.2.0, darwin/arm64; one synthetic 137,889-byte TSX module containing 1000 distinct JSX call sites; 5 warmups and 25 timed samples per phase; medians in milliseconds. Every backend must report exactly 1000 JSX elements.

| Parser                     | Version |  Parse | Parse + full AST walk |
| -------------------------- | ------- | -----: | --------------------: |
| @babel/parser              | 7.29.12 |  8.075 |                12.026 |
| @babel/parser (next major) | 8.1.0   |  7.961 |                11.961 |
| @swc-next/core             | 0.5.0   |  1.969 |                 6.280 |
| oxc-parser                 | 0.156.0 | 11.609 |                16.536 |
| typescript                 | 5.9.3   |  7.910 |                 9.332 |

SWC Next was about 4.1x faster than Babel 7 for parsing and 1.9x for parsing plus walking on this sample. The JS AST materialization/walking cost matters: the upstream 10x claim must not be presented as an end-to-end server speedup. Babel 8 was approximately tied with Babel 7 here.

Limitations: synthetic input only, fixed backend order, all backends loaded into one process, no isolated memory comparison, no repeated-process confidence interval, and different AST traversal implementations. SWC Next runs semanticErrors checks; all backends check reported parse diagnostics. The test does not validate import identity, type checking, scope/bindings, security/completeness semantics, or project I/O. It is a candidate-selection experiment, not a production parity test.

Raw results: [ast-parser-benchmark.json](ast-parser-benchmark.json). Reproduce from a repository checkout on Node 24.11+ (Babel 8 and Oxc remain benchmark-only dependencies; SWC Next is now an optional runtime dependency for the explicit discovery experiment):

```sh
npm ci --ignore-scripts
npm install --no-save --package-lock=false @babel/parser@7.29.12 @swc-next/core@0.5.0 oxc-parser@0.156.0 babel-parser-next@npm:@babel/parser@8.1.0
node scripts/benchmark-parsers.mjs
npm ci --ignore-scripts
```

The script is [scripts/benchmark-parsers.mjs](../scripts/benchmark-parsers.mjs).

## Recommended implementation order

1. Retire Node 20: require Node 24.11+ and test Node 24/26; retain Node 26 for OIDC publishing. This runtime-floor change is breaking and belongs in the next major release, not a silent replacement of 4.0.0.
2. Keep the current production parsers in this change. First profile full CLI/MCP queries: the modern path builds a TypeScript Program in src/jsx-query.ts, while the legacy path uses Babel scope bindings in src/jsx-analyzer.ts. A faster syntax parser does not supply either a TypeChecker or Babel scope.getBinding.
3. Prototype SWC Next for syntax-only JSX discovery behind the existing response contract. Retain TypeScript for typed inspection/import identity; do not add an extra parse pass unless measurements justify it.
4. Gate rollout on real-project end-to-end timings and the full existing regression suite, plus quoted/computed keys, shadowing, rest exclusions, UTF-16 locations, syntax errors, unknown spreads, package portability, root/symlink containment, and identical completeness flags.
5. Independently evaluate Babel 8 for maintained binding semantics and TypeScript 6 compatibility APIs. Do not combine three AST migrations with a runtime/CI change.

## Follow-up implementation

An [opt-in SWC Next discovery adapter](find-jsx.md#experimental-swc-next-discovery) is now available for query/find_jsx. It retains the TypeScript Program/checker, shared semantic projection, and per-file TypeScript recovery. The recorded full-query benchmark does not show a speedup, so the default stays TypeScript and no production-wide parser switch is claimed.

## Sources

- [SWC Next repository and API status](https://github.com/swc-project/swc-next)
- [SWC Next flat AST design](https://next.swc.rs/architecture/flat-ast)
- [Rspack 2.3.0 release](https://github.com/web-infra-dev/rspack/releases/tag/v2.3.0)
- [Rspack SWC Next migration PR #16089](https://github.com/web-infra-dev/rspack/pull/16089)
- [Babel 8 migration guide](https://babeljs.io/docs/v8-migration)
- [Oxc parser guide](https://oxc.rs/docs/guide/usage/parser.html)
- [TypeScript 7 announcement and API limitations](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)
- [Node release schedule](https://github.com/nodejs/Release)
- npm registry metadata for the exact package versions above.
