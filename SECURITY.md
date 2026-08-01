# Security and safe operation

This MCP server reads files and directories named in client-provided tool arguments. It runs over stdio and is intended to be launched by a trusted local MCP client. Do not expose the process directly to untrusted or network-accessible clients.

## Restrict readable roots

By default, no filesystem whitelist is applied. Configure a comma-separated list of roots with either:

- the `ALLOWED_ROOTS` environment variable; or
- the `--allowed-roots` CLI flag.

The CLI flag takes precedence if both are present. Roots may be absolute or relative to the server process working directory; absolute paths are recommended in MCP client configuration.

Environment example:

```bash
ALLOWED_ROOTS="/workspace/project" npx --yes jsx-prop-lookup-mcp-server
```

CLI example:

```bash
npx --yes jsx-prop-lookup-mcp-server --allowed-roots "/workspace/project,/workspace/shared"
```

MCP client example:

```json
{
  "mcpServers": {
    "jsx-prop-lookup": {
      "command": "npx",
      "args": ["--yes", "jsx-prop-lookup-mcp-server"],
      "env": {
        "ALLOWED_ROOTS": "/workspace/project"
      }
    }
  }
}
```

When roots are configured, every tool path must resolve within one of them. Targets outside the configured roots are rejected. The containment check resolves symlinks, so a symlink inside an allowed root cannot be used to access an existing target outside it.

## Operational guidance

- Grant access only to directories the analysis requires.
- Run the server as an unprivileged account.
- Treat the MCP client as trusted code because it chooses tool arguments.
- Keep secrets and credential files outside allowed roots where possible.
- Do not place credentials in MCP configuration beyond values required by the client itself; this server does not require credentials.
- Use additional process or container sandboxing when the client or analyzed project is not fully trusted.
- Keep server diagnostics on stderr so stdout remains dedicated to MCP stdio messages.

The project implements tools only. It does not provide an HTTP listener, resources, or prompts.
