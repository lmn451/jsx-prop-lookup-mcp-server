# Repository Analysis Findings

## What this repo is
- An MCP (Model Context Protocol) server that analyzes JSX/TSX to report component props, usages, and missing required props using Babel AST.
- Distributed as an npm CLI (intended to be run via `npx`) and used by MCP clients (e.g., Claude Desktop, Cline).

## Architecture overview
- `src/index.ts`: MCP server entry. Registers four tools, validates inputs, routes to analyzer, runs on stdio via `@modelcontextprotocol/sdk`.
- `src/jsx-analyzer.ts`: `JSXPropAnalyzer` with file discovery (glob), parsing (`@babel/parser` with JSX + TS plugins), AST traversal (`@babel/traverse`) to extract:
  - Component prop definitions (parameter destructuring, `...rest`).
  - JSX element prop usage (name, value, location, spread detection).
  - TypeScript interfaces named `XxxProps` mapped to component `Xxx`.

## Docs and packaging
- README/USAGE/QUICK_START/TROUBLESHOOTING are comprehensive and aligned with a zero‑install `npx` usage.
- `package.json` (ESM, build/dev scripts, bin at `dist/index.js`), `tsconfig.json` targets ES2022.

## Strengths
- Solid AST configuration and traversal with location tracking.
- Handles object destructuring, rest/spread props, and basic prop value extraction.
- Robust file discovery (ignores `node_modules`, `dist`, `build`, `nodir`).
- Clean separation between MCP protocol layer and analysis engine.
- Example components illustrate usage and edge cases.

## Key issues and gaps to fix
1) Tool input validation mismatch (breaking for 3 tools)
- `src/index.ts` requires `args.path` (absolute) for all tools, but only `analyze_jsx_props` defines `path`. Other tools define `directory` instead → runtime errors unless callers pass undocumented `path`.

2) Node version check is incorrect
- Uses lexicographic string comparison: `process.version.split(".")[0].slice(1) < "18"`. This is unreliable. Should compare numeric major version.

3) Redundant path validation
- Duplicate absolute/existence checks back‑to‑back in `src/index.ts`.

4) `findComponentsWithoutProp` summary is misleading
- Tracks only missing usages; computes `missingPropPercentage` against that same count → always 100% when any results exist. Should track total component instances scanned.

5) Analyzer misses common component patterns
- Arrow functions with identifier parameter aren't analyzed in body (only destructured params handled).
- Function/arrow components using non‑"props" param name are missed by body member access (hardcoded `props` in `findPropsInFunctionBody`).
- JSX names using `JSXMemberExpression` (e.g., `UI.Select`) are ignored (only `JSXIdentifier` handled).
- TS type aliases for props (e.g., `type ButtonProps = { ... }`) not recognized; only `TSInterfaceDeclaration` mapped.

6) Minor mismatches/polish
- Server version in `src/index.ts` is `"1.0.0"` while `package.json` is `"3.0.3"`.
- UX: allow relative `directory` inputs (resolve against `process.cwd()`), matching docs that suggest simple directory usage.

## Recommended fixes and improvements
- Must‑fix (align code with docs):
  - In CallTool handler, require/validate `args.path` only for `analyze_jsx_props`.
  - For other tools, accept `args.directory` (default `"."`), resolve with `path.resolve(process.cwd(), dir)` if relative, and validate existence.
  - Remove duplicate path checks.
  - Fix Node version check using numeric comparison from `process.versions.node`.

- Analyzer robustness:
  - If the component parameter is an Identifier, traverse the body using that identifier name (not hardcoded `props`).
  - Support `JSXMemberExpression` component names when matching `targetComponent` and when collecting usages.
  - Detect TS type aliases named `XxxProps` in addition to interfaces.

- Quality of life:
  - In `findComponentsWithoutProp`, track total occurrences and compute real percentage (`missing / total`). Also report total scanned files.
  - Normalize server version (read from `package.json` or sync constant).
  - Optionally enrich `includeTypes` output with required/optional flags or literal unions where feasible.

## Testing suggestions
- Add sample files for:
  - Arrow functions with identifier param and body member access.
  - Function components using non‑"props" param name.
  - `JSXMemberExpression` component names (e.g., `UI.Select`).
  - TS type aliases for props.
- Add a tiny harness or unit tests that call analyzer methods directly (no MCP) to validate the above behaviors.
