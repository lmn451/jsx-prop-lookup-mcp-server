# MCP v2 Connection Debugging Guide

## Runtime contract

This server requires Node.js 20 or newer and uses:

- `@modelcontextprotocol/server` v2;
- the `2026-07-28` protocol/specification line; and
- stdio transport only.

The server rejects legacy `initialize`-first connections. Use an MCP v2 client that pins or negotiates `2026-07-28`.

## Verify the executable

```bash
node --version
npm run typecheck
npm run build
node dist/index.js --help
```

The help command should print the package version, Node.js requirement, allowed-roots options, and the four tool names. Normal startup writes its banner to stderr; stdout is reserved for MCP protocol messages.

## Recommended client configuration

Restrict the server to the project it should inspect:

```json
{
  "mcpServers": {
    "jsx-prop-lookup": {
      "command": "npx",
      "args": [
        "--yes",
        "jsx-prop-lookup-mcp-server",
        "--allowed-roots",
        "/absolute/path/to/project"
      ]
    }
  }
}
```

For a local build:

```json
{
  "mcpServers": {
    "jsx-prop-lookup": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "/absolute/path/to/jsx-prop-lookup-mcp-server",
      "env": {
        "ALLOWED_ROOTS": "/absolute/path/to/project"
      }
    }
  }
}
```

## Run the integration smoke test

The test suite uses the official `@modelcontextprotocol/client` v2 package and exercises discovery, tool listing, all four tools, validation errors, filesystem errors, and relative paths:

```bash
node --test tests/mcp.smoke.test.js
```

## Common failures

### `Unsupported protocol version`

The client is using an older MCP generation. Configure its v2 negotiation to pin `2026-07-28`, or upgrade the client. A raw `initialize` request from a pre-v2 client is intentionally rejected.

### `Connection closed`

Check:

1. Node.js is version 20 or newer.
2. `dist/index.js` exists after `npm run build`.
3. The configured `cwd` and executable paths are correct.
4. No application writes logs to stdout.
5. The client is starting the process once and owning its stdio transport.

### Path access errors

`ALLOWED_ROOTS` and `--allowed-roots` accept comma-separated absolute or working-directory-relative roots. The CLI option takes precedence. Existing paths reached through symlinks are checked by their resolved target.

## Logs and shutdown

Operational errors and the startup banner go to stderr. SIGINT and SIGTERM close the stdio transport before exiting.
