**Executive Summary**

- **Repository**: rovo-mcp
- **Summary**: Create and track remediation tasks from the `opus-agent` review. Keep fixes small and prioritized: security documentation and sandboxing first, then linting/typing, then analyzer improvements and tests.

**High-Priority Tasks**

- **Security README**: Add a clear warning that the MCP server reads files under provided paths and must not be exposed to untrusted inputs. Recommend deployment best-practices and whitelist usage.
  - Status: completed
  - Files: `src/index.ts`, `README.md`

- **Sandbox / `allowed_roots`**: Implement an `allowed_roots` (env or CLI) validation layer that rejects file/directory requests outside configured roots and/or enforces a max file count.
  - Status: completed (tests added)
  - Suggested tests: ensure symlinks and paths outside roots are rejected.

- **Type Safety (`noImplicitAny`)**: Enable `noImplicitAny: true` in `tsconfig.json` and incrementally fix surfaced type errors.
  - Status: not-started
  - Command: `npm run build` to reveal errors.

**Medium / Low Priority Tasks**

- **ESLint + Prettier**: Add linting and formatting, `npm run lint`, `npm run format`, and CI lint step.
  - Status: completed (configs added; run `npm install` to install dev deps)

- **Improve `analyzeJSXElement` value extraction**: Extend extraction to support `MemberExpression`, `CallExpression`, `ArrowFunctionExpression`, and `TemplateLiteral` where sensible.
  - Status: not-started
  - Target file: `src/jsx-analyzer.ts`

- **Console/Exit tidiness in `src/index.ts`**: Reorganize Node version check and startup logging for clarity.
  - Status: not-started

- **Swallowed parse errors debug mode**: Add a `--debug` or `LOG_LEVEL=debug` option to surface parse errors instead of silently continuing.
  - Status: not-started

**Patches Already Applied**

- **Parse error message improvement**: Replaced `Failed to parse ${filePath}: ${error}` with error message extraction to avoid `[object Object]`.
  - Status: completed
  - File: `src/jsx-analyzer.ts`

- **Centralize `traverse` default export**: Normalized `(traverse as any).default || traverse` into a single `traverseDefault` instance property.
  - Status: completed
  - File: `src/jsx-analyzer.ts`

**Tests & Repro**

- **Install**:

```bash
npm ci
```

- **Build**:

```bash
npm run build
```

- **Run tests**:

```bash
npm test
```

**Suggested Work Plan (prioritized)**

1. Add `README.md` section with security note and usage examples. (quick)
2. Implement `allowed_roots` validation (medium) + tests. (safety-critical)
3. Add `--debug` or `LOG_LEVEL` support to surface parse errors during analysis. (small)
4. Add ESLint + Prettier and CI lint step. (medium)
5. Enable `noImplicitAny` in `tsconfig.json` and fix issues incrementally. (larger)
6. Add tests for `getJSXName` and complex JSX expression extraction. (medium)
7. Improve `analyzeJSXElement` extraction for common expression types. (medium)

**Checklist**

- [x] Parse error message improvement (`src/jsx-analyzer.ts`)
- [x] Centralize `traverse` default export (`src/jsx-analyzer.ts`)
- [x] Add security README note
- [x] Implement `allowed_roots` sandbox + tests
- [x] Add tests for `allowed_roots` enforcement
- [ ] Add ESLint + Prettier
- [x] Add CLI `--allowed-roots` flag
- [ ] Enable `noImplicitAny` and fix types
- [ ] Add new unit tests for JSX extraction
- [ ] Improve `analyzeJSXElement` value extraction

**If you want me to proceed**

- Reply with which item to prioritize (use the task number or short name). I can implement the README note and/or the `allowed_roots` sandbox next.
