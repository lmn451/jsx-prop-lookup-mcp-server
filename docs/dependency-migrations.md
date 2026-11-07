# Dependency migrations

The November 2026 dependency refresh starts from `f6f3504`. Node.js 24.11.0+ remains required. Registry stable releases were checked on 2026-11-07.

## Babel 8

Read the complete upstream [user migration guide](https://babeljs.io/docs/v8-migration) and [API migration guide](https://babeljs.io/docs/v8-migration-api).

The legacy analyzer now uses parser, traverse and types 8.1.0 together. Babel 8 is ESM-only and includes traverse declarations, so the CommonJS default-export normalization and `@types/babel__traverse` dependency have been removed. NodeNext resolves the bundled declarations through package exports. Standard syntax plugins (class properties, object rest/spread, namespace exports, dynamic imports, nullish coalescing and optional chaining) are no longer explicitly configured; JSX, TypeScript and the existing proposal syntax remain enabled.

Dynamic imports now use `ImportExpression.source` and `.options`, rather than `CallExpression.callee/arguments`. The analyzer renders this new node explicitly. `BigIntLiteral.value` is now a JavaScript bigint; readable prop values convert it to a string before entering JSON results. Generic JSX, function signatures, interface heritage, mapped types and enum bodies are traversed with Babel 8's own visitor keys and types. No code depends on the removed NodePath/Scope methods or renamed TypeScript AST fields. Existing binding-based shadowing and rest-forwarding behavior remains covered by regression tests.

Babel 8 rejects unparenthesized sequence expressions in JSX attributes and unescaped angle brackets in JSX text. Tests require these invalid inputs to produce explicit parse failures, and verify their valid parenthesized/escaped forms. JSX locations still use parser UTF-16 offsets; no code-frame column conversion applies. We do not transform JSX, use Babel presets, or serialize whole ASTs, so preset/runtime, transform, generator and token API migrations do not apply.

## TypeScript 6

Read the complete [TypeScript 6.0 release and migration notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html) and the [TypeScript 7 announcement's API and side-by-side guidance](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/).

The embedded compiler is pinned to 6.0.3, the newest stable 6.x release. TypeScript 7.0.2 is the latest overall release, but does not expose the JavaScript Compiler API required by `createProgram`, the TypeChecker, source AST inspection and module resolution. The separate `@typescript/typescript6` compatibility package was still 6.0.2 when checked. Installing a native build compiler alongside 6.x would add a second compiler without replacing this runtime requirement. The lint parser also supports TypeScript below 6.1.

The server build now uses `module` and `moduleResolution` set to `NodeNext` in place of deprecated Node10 resolution. Its existing `.js` relative imports already match Node ESM. `types: ["node"]` explicitly restores the Node globals under TypeScript 6's new empty default. The existing explicit `rootDir`, `target` and strict settings retain their intended behavior. The paths fixture no longer uses deprecated `baseUrl`; its relative path mappings work without it.

TypeScript 6 also defaults to strict checking. The query snapshot explicitly sets `strict: false` before applying user compiler options to preserve existing analysis results for projects without strict settings (for example, optional prop evidence stays `type: "string", required: false`). Project `strict: true` and individual `strictNullChecks: true` settings still override that default and report `string | undefined`; regression tests cover both. User project compiler options continue to be read through the project boundary. We do not silently rewrite user configurations, add `ignoreDeprecations`, or change the runtime query's resolution mode. TypeScript's internal `matchFiles` walker is still required for exact tsconfig glob semantics against the validated filesystem snapshot; the exact version pin and project-discovery regressions protect this dependency. Import aliases, imported prop types, quoted/computed keys, uncertainty and filesystem containment are checked by the analysis suite.

## MCP 2.4

Read all [2.4.0 release and upgrade notes](https://github.com/modelcontextprotocol/typescript-sdk/releases/tag/v2.4.0). Client and server upgrade together from 2.3.1 to 2.4.0, along with the shared core dependency.

The server uses stdio, has no `x-mcp-header` numeric annotations, and registers no output schemas with `.meta({ id })` or custom `$id`/`$ref` URI schemes. The changed header validation, legacy protocol output wrapping and stricter fast-uri URI validation therefore need no local API rewrite. The handlers already return direct `structuredContent`, which is asserted by real MCP tests. Skills and OAuth refresh scopes are opt-in upstream additions and are not enabled by this update. The existing protocol revision and tool inventory remain unchanged.

## Development tools and lockfile

Read the [Stryker 10.0–10.1.1 changelog](https://github.com/stryker-mutator/stryker-js/blob/master/CHANGELOG.md). Core and tap-runner upgrade together to 10.1.1. The breaking Node 20 removal is satisfied by the existing Node 24.11 floor. Existing TAP configurations are retained and exercised by the release-version mutation gate; Stryker 10 also brings Babel 8 instrumentation support.

Mutation sandboxes exclude the ignored `.context` directory, which holds local migration guides, dependency caches and test fixtures.

Other direct updates are ESLint 10.14.0, typescript-eslint 8.72.1 (parser/plugin together), Prettier 3.9.10, glob 14.0.4, ignore 7.0.14, globals 17.14.0, semver 7.8.6 and Node declarations 26.6.6. Remaining direct packages already matched their stable registry tags. Compatible transitive updates include fast-uri 3.1.9.

### Scoped security migrations

Updating within declared ranges initially left 14 moderate findings in the development tree. Read the upstream [minimatch changelog](https://github.com/isaacs/minimatch/blob/main/changelog.md), [glob changelog](https://github.com/isaacs/node-glob/blob/main/changelog.md) and [qs changelog](https://github.com/ljharb/qs/blob/main/CHANGELOG.md), including the complete applicable 11.x, 14.x and 6.15.1–6.17.1 migration notes, before adding these parent-scoped overrides:

- **minimatch 11.0.5** for ESLint 10.14, config-array 0.23.5, typescript-estree 8.72.1 and Stryker core 10.1.1 fixes [globparts amplification](https://github.com/advisories/GHSA-g3hv-75wg-m249). Version 11 replaces regex path segments with nonrecursive matchers and removes `makeRe`, `regexp`, `AST` and several internal methods/options. The inspected parent callsites use only retained `minimatch`, `Minimatch.match`, `hasMagic` and `pattern` APIs. No parent examines `Minimatch.set` or relies on removed regex APIs. ESLint uses partial matches for recursive directory traversal; tests exercise nested file discovery and ignore configuration. The typescript-eslint project-service test exercises both accepted and rejected `allowDefaultProject` matches with real type information. Stryker's mutation gate exercises its project matching, ignore handling, instrumentation and TAP runner.
- **glob 14.0.4** for Stryker tap-runner 10.1.1 fixes [AbortSignal cancellation bypass](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4). Version 14 removes internal regex-pattern APIs, changes rooted ignore patterns and uses minimatch 11. TAP's actual helper only calls `glob(patterns, { ignore: ['**/node_modules/**'], posix: true })`; it uses none of the removed internals, CLI, rooted ignores or changed walker APIs. An executable helper test checks recursive brace patterns and node_modules exclusion, alongside the real mutation gate.
- **qs 6.17.1** under Stryker core's typed-rest-client 2.3.1 fixes [comma array entries](https://github.com/advisories/GHSA-q8mj-m7cp-5q26), [comma array-limit bypass](https://github.com/advisories/GHSA-x5fp-wj9c-mxmx), [controlled isBuffer](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g) and [non-callable toString](https://github.com/advisories/GHSA-6pq8-jhm2-2vcw). It stays on qs's 6.x API rather than upgrading typed-rest-client across a major version. The parent only uses `stringify` with query-prefix, delimiter, dot-key, array-format and value-encoding options. Tests call the parent's actual URL builder, preserve its encoding and empty comma-array slots, and reproduce the formerly crashing null/undefined and non-callable-toString inputs.

Overrides are restricted to the inspected parent versions or current direct dependency major ranges, not the whole dependency graph. Reassess them when upgrading those parents. These tests validate the affected parent behavior; they do not claim compatibility with every removed minimatch or glob API.

After these migrations, both the complete tree and the production-only tree report **zero npm audit findings** as of 2026-11-07.

## Verification

Run `npm ci`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm test` and `npm run test:mutation`. The test suite includes real MCP subprocesses, CLI/MCP parity, JSX semantic analysis, root/symlink containment, release workflow validation and an isolated packed production installation. CI additionally randomizes test order on Node 26. Audit the refreshed production and development dependency trees separately when assessing remaining advisories.

Local migration verification on Node 26.2.0 passed a clean locked installation, type checking, lint, build, the tsx development entry point and all **659 tests** with concurrency 4 and randomized seed `20261006`. The release-version mutation gate killed **35/35 mutants (100%)**, above its 90% threshold. On the exact minimum runtime, Node **24.11.0**, all **41 focused tests** passed for Babel analysis/bindings, MCP negotiation and semantic inspection, the isolated packed production installation, and the overridden tools' executable behavior. `npm ls --all` validates the final graph; the only direct stable-version exception reported by `npm outdated` is the documented TypeScript 6 API ceiling.