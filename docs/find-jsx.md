# Find JSX call sites

`find_jsx` searches JSX elements using import identity. It never runs application code. For legacy MCP tool compatibility, see the [CLI reference](cli.md).

```json
{
  "component": "Button",
  "source": "./ui",
  "prop": "title",
  "value": "Save",
  "limit": 100,
  "offset": 0
}
```

`import { Button as B } from './ui'` matches this component/source pair when the JSX tag is `B`; `Button` from another module is excluded. Namespace imports (`UI.Button`), default imports (`component: "default"`), local re-exports, and local tsconfig path aliases are supported. Shadowed bindings retain their lexical identity. Source filters are exact import specifiers or local modules resolved relative to each call site, within the configured project boundary.

Each match includes its local component name, import identity and resolved definition when available, one-based location, source snippet, props, and unknown spreads. Prop values are `{ "status": "known", "value": ... }` for literals and `{ "status": "unknown", "expression": ... }` otherwise. Static object literal spreads and JSX children count as props. No expression, getter, function, or imported application module is executed. JSX text containing ampersands is conservatively unknown because encoded JSX entities require runtime text normalization. Object prototype setter syntax is also unknown; computed own keys remain supported.

`prop` requires a provably present prop. `value` requires `prop`, compares primitive values as strings (`true`, `3`, `null`, or a string's contents), and excludes values that cannot be established statically. Dynamic spreads might contain or override a queried prop; these appear in `unresolved`, and `complete` is false. Literal spread keys remain present even when their values are dynamic, shorthand, getters, or methods. Nested literal spreads are read in source order; unknown spreads and dynamic computed keys can make earlier values unknown without removing proven prop presence. A later explicit property or attribute restores its own known value. Missing component modules and parse errors are also reported rather than silently treated as complete analysis.

Results use the shared sorted pagination contract: `matches`, `total`, `offset`, `limit`, `nextOffset`, `unresolved`, and `complete`. Defaults are offset zero and 100 matches, with a maximum page size of 500. Omit filters to list all discovered JSX call sites.

## Experimental SWC Next discovery

Set `"discovery": "swc"` on `find_jsx`, or pass `--discovery swc` to the `query` CLI command. The default is `typescript`; `inspect_component`, `check_jsx`, legacy analysis, and their CLI commands remain unchanged.

```json
{ "component": "Button", "source": "./ui", "discovery": "swc" }
```

This is an opt-in syntax-discovery adapter, not a replacement for TypeScript semantic analysis. SWC Next 0.5.0 enumerates JSX opening elements; their UTF-16 offsets locate existing TypeScript nodes through a cached range index. Both paths share the same projection of import identities, props, spreads, children, snippets, locations, pagination, and completeness. Each request constructs a fresh TypeScript Program and resolves modules again; its checker is created lazily. Unchanged syntax can be reused after validation, but semantic identities/results are always projected afresh. TypeScript remains the authority for diagnostics and recovery. No application code is executed and SWC receives only source strings already read through the workspace boundary.

If SWC reports syntax/semantic errors, its walker fails, or an opening offset cannot be matched, that entire file uses the TypeScript collector. No partially discovered file results are returned. `collectJsxWithSwc` exposes `fallbackFiles` for diagnostics/benchmarks, but the public result-page shape is unchanged. Native process crashes cannot be recovered by JavaScript; the backend remains experimental.

The pinned `@swc-next/core` package is an optional native dependency and is loaded only for an explicitly selected SWC query. Default queries, inspection, checking, and server startup work without it. `--omit=optional` installations or unsupported native environments receive an actionable error only if SWC is selected. Install optional dependencies to enable it; no hidden environment variable changes the production backend.

### Validated syntax reuse

A weak cache scoped to the `ProjectWorkspace` retains only the latest syntax set. Every compiler source request still resolves and reads the file through `ProjectWorkspace.readFile`; reuse requires exact content equality, matching compiler options, language target and implied module format. Neither timestamps nor cached permissions are trusted. Configuration, discovery filters, module resolution, and diagnostics remain fresh on every query. Changed/deleted/escaped dependencies cannot be recovered from an old Program because Programs and checkers are not cached.

TypeScript and SWC keep separate weak indexes of JSX nodes keyed by the immutable, validated SourceFile. Repeated unchanged queries avoid both TypeScript reparsing and SWC parsing/walking, while matches, values and identities are rebuilt against the new semantic Program. `collectJsxWithSwc` reports `parsedFiles` and `reusedFiles` alongside `fallbackFiles` for verification; no backend/caching fields are added to public result pages. A fresh CLI process/workspace has no cache benefit.

### Measure the complete query, not just the parser

From a repository checkout:

```sh
npm ci
npm run build
npm run benchmark:discovery
```

The current recorded run used 41 files / 1000 JSX sites, 15 measured queries per backend, three warmups, and alternating order on Node v26.2.0 (darwin/arm64), with independent per-backend workspaces. Fresh-workspace medians: TypeScript **35.671 ms**, SWC **37.619 ms**. Reused-workspace medians: TypeScript **26.332 ms**, SWC **26.482 ms**. All outputs were deeply equal and no files fell back. Warm SWC queries were about 30% lower latency than fresh-workspace SWC queries; both backends benefit from syntax reuse. **SWC itself still does not beat the optimized TypeScript path**, and fresh workspaces still pay for both parsers. This is a repeated-query cache improvement, not a native-parser speedup or a cold CLI speedup.

The timing includes fresh validated reads, new Programs/resolution and semantic projection, filtering, and pagination. Warm requests reuse only unchanged syntax/discovery; the separate fresh-workspace samples include initial parsing. It excludes process startup, first native-module import, and MCP transport; it is not a real-project performance guarantee. Raw results: [swc-discovery-benchmark.json](swc-discovery-benchmark.json). Keep the TypeScript default until representative project timings justify a broader migration.

The exported `createJsxSnapshot` and `collectJsx` APIs let related analysis tools inspect every match before pagination, using the same filesystem and import resolution boundary. The experimental collector is in `swc-discovery.js`; importing that module directly requires the optional native dependency.
