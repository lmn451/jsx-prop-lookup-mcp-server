# Data Collection and Privacy

## Current behavior

The server does not send analytics, telemetry, source code, or analysis results to a remote service. It has no Supabase client and no network transport.

Tool requests can cause the server to:

- read the JavaScript, JSX, TypeScript, and TSX files under the requested path;
- return component and prop information to the connected MCP client; and
- write operational messages and parse/read errors to stderr.

The server does not persist request data, maintain user sessions, fingerprint machines, or collect background usage metrics. The MCP client and host determine what happens to tool results after the server returns them.

Filesystem boundaries and configuration are documented in [SECURITY.md](SECURITY.md).

## Logging

The server logs only operational status and errors to stderr. It does not log file contents or tool results by default. stdout is reserved for MCP protocol messages.
