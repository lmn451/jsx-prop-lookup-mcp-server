# Test Infrastructure

This project uses Node.js's built-in test runner. The suite covers the AST analyzer, filesystem containment, and the MCP v2 stdio boundary.

## Test structure

### Analyzer tests

`tests/analyzer.test.js` covers:

- JavaScript, JSX, TypeScript, and TSX parsing;
- component and prop discovery;
- TypeScript interface detection;
- destructured and identifier-based prop access;
- namespaced JSX names;
- spread attributes;
- common JSX expression values;
- invalid-path and parse-error handling; and
- missing-required-prop analysis.

### MCP integration tests

`tests/mcp.smoke.test.js` uses `@modelcontextprotocol/client` v2 and `StdioClientTransport` to exercise:

- pinning and negotiating protocol/specification `2026-07-28`;
- server identity and discovery;
- the exact four-tool inventory;
- valid calls to all four tools;
- invalid arguments and tool-level errors;
- relative paths from the configured working directory; and
- clean client-owned process shutdown.

### Filesystem security tests

`tests/allowed_roots.test.js` covers:

- access within configured roots;
- rejection outside configured roots;
- CLI and environment configuration; and
- symlink targets that resolve outside an allowed root.

## Running tests

```bash
npm ci
npm run typecheck
npm run lint
npm run build
npm test
```

Individual suites:

```bash
node --test tests/analyzer.test.js
node --test tests/mcp.smoke.test.js
node --test tests/allowed_roots.test.js
```

Coverage uses Node's experimental built-in instrumentation:

```bash
npm run test:coverage
```

## Test data

Tests use `examples/sample-components/`:

- `App.tsx` — Button and Card usage;
- `Button.tsx` — destructured props and `ButtonProps`;
- `Card.tsx` — `CardProps`;
- `SelectExample.tsx` — required-prop and spread scenarios; and
- additional namespaced and identifier-access fixtures.

## CI expectations

The supported runtime is Node.js 20 or newer. Tests are deterministic, use no network services, and communicate with the MCP server over local stdio only. The integration test starts `src/index.ts` through `tsx`; `npm run build` separately verifies the published `dist/` output.

When adding a tool, update the MCP v2 integration inventory and call coverage, then update the current four-tool documentation and release notes.
