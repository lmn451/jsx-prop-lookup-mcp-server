# Troubleshooting

## Runtime contract

The server requires Node.js 20 or newer and an MCP v2 client that supports protocol/specification `2026-07-28`. It runs over stdio only. A legacy `initialize`-first client is intentionally rejected.

## Recommended configuration

Use an absolute allowed root:

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

For a local checkout:

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

## Verify locally

```bash
node --version
npm ci
npm run typecheck
npm run lint
npm run build
node --test tests/mcp.smoke.test.js
```

The startup banner and operational errors go to stderr. stdout is reserved for MCP JSON-RPC traffic.

## Common failures

### `Unsupported protocol version`

Upgrade the MCP client or configure it to pin/negotiate `2026-07-28`. Do not send a raw legacy `initialize` request.

### `Connection closed`

Check Node.js version, the executable path, `cwd`, and that no wrapper writes logs to stdout. For local development, build `dist/index.js` first.

### Path access denied

The requested target is outside the configured allowed roots, or a symlink resolves outside them. Use an absolute root and ensure the client process has read permissions. The `--allowed-roots` flag overrides `ALLOWED_ROOTS`.

### npx cannot start

Check `npx --version` and network access, or use the local-build configuration above. Global installation is optional:

```bash
npm install --global jsx-prop-lookup-mcp-server
```

## Client compatibility

The official v2 TypeScript client can exercise this server directly:

```bash
node --test tests/mcp.smoke.test.js
```

Older MCP clients that only know v1 package paths or pre-2026 protocol behavior are outside the supported compatibility target.
