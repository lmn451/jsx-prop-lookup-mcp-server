# Project maintenance status

The repository has completed the MCP v2 migration and the remediation work recorded in the original review.

## Completed

- Migrated the server to `@modelcontextprotocol/server` v2 and the `2026-07-28` protocol/specification line.
- Raised the runtime requirement to Node.js 20 or newer.
- Replaced the v1 `server.tool()` registration API with `server.registerTool()`.
- Added modern-only stdio negotiation and v2 client integration coverage.
- Upgraded direct runtime and development dependencies to the current compatible release line.
- Added the ESLint 10 flat configuration and removed the obsolete `.eslintignore`/`.eslintrc.cjs` setup.
- Enabled strict TypeScript checking, including `noImplicitAny`.
- Added filesystem root enforcement through `ALLOWED_ROOTS` and `--allowed-roots`, including symlink containment tests.
- Added readable JSX expression extraction for common literals, members, calls, arrow functions, templates, objects, and arrays.
- Improved parse and filesystem error context while preserving caught errors as causes.
- Reconciled user-facing documentation with the four-tool product contract.
- Removed hardcoded credentials from the local MCP configuration and corrected its `disabled` flag.

## Deliberate non-goals

- The server remains stdio-only. HTTP transport, resources, and prompts are not part of this product.
- The server exposes four tools only; historical `query_components` and similarity-tool notes are not current APIs.
- No debug logging mode was added because operational failures already go to stderr and the current tool contract does not expose a debug flag.

## Verification commands

```bash
npm run typecheck
npm run lint
npm run build
npm test
```
