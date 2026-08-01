# Data Collection and Privacy

## Current behavior

The server does not send analytics, telemetry, source code, or analysis results to a remote service. It has no Supabase client and no network transport.

Tool requests can cause the server to:

- read the JavaScript, JSX, TypeScript, and TSX files under the requested path;
- return component and prop information to the connected MCP client; and
- write operational messages and parse/read errors to stderr.

The server does not persist request data, maintain user sessions, fingerprint machines, or collect background usage metrics. The MCP client and host determine what happens to tool results after the server returns them.

## Filesystem access

Paths are supplied by the MCP client. Without configuration, the server does not apply a filesystem allowlist. Restrict access for normal deployments:

```bash
ALLOWED_ROOTS="/absolute/path/to/project" node dist/index.js
```

or:

```bash
node dist/index.js --allowed-roots "/absolute/path/to/project"
```

The CLI option takes precedence over `ALLOWED_ROOTS`. Existing targets and configured roots are resolved before containment checks, so a symlink that escapes an allowed root is rejected.

## Logging

The server logs only operational status and errors to stderr. It does not log file contents or tool results by default. stdout is reserved for MCP protocol messages.

## Related source files

The active request path is implemented in:

- `src/index.ts` — MCP v2 tool handlers and filesystem validation;
- `src/jsx-analyzer.ts` — local AST parsing and analysis; and
- `src/version.ts` — local package-version lookup.

Any unreferenced historical logging helpers are not part of the running server and must not be described as active data collection.

For deployment guidance, see [SECURITY.md](SECURITY.md).
