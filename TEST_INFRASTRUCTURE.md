# Test Infrastructure

This project uses Node.js's built-in test runner. The suite covers the AST analyzer, filesystem containment, and the MCP v2 stdio boundary.

## Test structure

### Analyzer tests

`tests/analyzer.test.js` and `tests/analyzer.regression.test.js` cover:

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

`tests/mcp.smoke.test.js` and `tests/mcp.boundary.test.js` use `@modelcontextprotocol/client` v2 and `StdioClientTransport` to exercise:

- pinning and negotiating protocol/specification `2026-07-28`;
- server identity and discovery;
- the exact four-tool inventory;
- valid calls to all four tools;
- invalid arguments and tool-level errors;
- relative paths from the configured working directory; and
- clean client-owned process shutdown.

Boundary cases exercise default working-directory paths, argument type errors, optional type metadata, concurrent requests with different filters, and successful retries after fixing an invalid file on the same connection.

`tests/server.test.js` checks that constructing a server has no CLI side effects and that two instances keep their filesystem restrictions independent, using real MCP clients and in-memory transports.

`tests/cli.test.js` executes the compiled CLI to check both help flags, invalid arguments, SIGINT/SIGTERM shutdown, and stdin EOF. `tests/request-logger.test.js` uses an injected transport to verify the disconnected logger's payload, opt-out, timeout, duration normalization, and one-time warning behavior without network requests.

### Filesystem security tests

`tests/allowed_roots.test.js` covers:

- access within configured roots;
- rejection outside configured roots;
- CLI and environment configuration; and
- symlink targets that resolve outside an allowed root.

Regression cases include symlinked files discovered during scans, literal bracketed directory names, internal symlinks, CLI precedence over environment configuration, multiple roots, relative roots, sibling-prefix rejection, and parent traversal.

### Release tests

`tests/release-version.test.js` checks the pure release-version policy: prepared versions, patch/minor/major bumps, prereleases, strict npm semver validation, explicit overrides, and highest-tag selection. `tests/release-workflow.integration.test.js` runs the release command in temporary Git repositories to verify package reads, merged-tag discovery, overrides, and failure exit status/output. These tests never publish or modify the project repository.

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

On Node.js 26, check order independence with a reproducible seed:

```bash
node --test --test-concurrency=4 --test-randomize --test-random-seed=20261006 tests/*.test.js
```

Analyzer setup runs before each test; no test relies on another test to initialize it. CI runs the seeded check on Node.js 26 as well as the normal suite on both supported test runtimes.

Mutation testing targets only the pure `.github/scripts/release-version.cjs` module:

```bash
npm run test:mutation
```

Stryker uses the existing Node test suite through its TAP runner and enforces a 90% mutation score. JSON and HTML reports are written to `reports/mutation/` (ignored by Git). The [TAP runner](https://stryker-mutator.io/docs/stryker-js/tap-runner/) reports coverage and mutant kills per test file, so these reports do not establish which individual test killed each mutant. Analyzer and MCP behavior is checked through real filesystem and transport integration tests rather than repeated server startup for every mutant.

## Test data

Tests use `examples/sample-components/`:

- `App.tsx` — Button and Card usage;
- `Button.tsx` — destructured props and `ButtonProps`;
- `Card.tsx` — `CardProps`;
- `SelectExample.tsx` — required-prop and spread scenarios; and
- additional namespaced and identifier-access fixtures.

## CI expectations

The supported runtime is Node.js 20 or newer. Tests are deterministic, use no network services, and communicate with the MCP server over local stdio or in-memory transports. Stdio integration and containment tests start the compiled `dist/index.js`, so run `npm run build` before the suite. The integration suite verifies the package version advertised to clients and checks that parse failures return tool errors without closing the connection.

CI runs the build, tests, scoped mutation checks, and lint on Node.js 20 and 26.

When adding a tool, update the MCP v2 integration inventory and call coverage, then update the current four-tool documentation and release notes.
