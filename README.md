# JSX Prop Lookup MCP Server

Find JSX call sites, inspect component props, and run saved prop rules from the
command line or an MCP client. Analysis reads JavaScript and TypeScript without
executing application code or editing source files.

## Install and run

Node.js 20 or newer is required.

```bash
npm install --global jsx-prop-lookup-mcp-server
jsx-prop-lookup-mcp-server query --project-root /workspace/app --component Button --json
jsx-prop-lookup-mcp-server inspect --project-root /workspace/app --component Button
jsx-prop-lookup-mcp-server check --project-root /workspace/app --rules checks/props.json --json
```

You can also prefix commands with `npx --yes jsx-prop-lookup-mcp-server`.
Running the executable without a command starts the MCP stdio server;
`serve` selects that behavior explicitly. See the [CLI reference](docs/cli.md)
for flags, output, and exit codes, and [saved checks](docs/saved-checks.md)
for the versioned JSON rules schema.

## MCP client configuration

The default MCP server exposes three read-only tools: `find_jsx`,
`inspect_component`, and `check_jsx`.

```json
{
  "mcpServers": {
    "jsx-prop-lookup": {
      "command": "npx",
      "args": ["--yes", "jsx-prop-lookup-mcp-server"],
      "env": {
        "PROJECT_ROOT": "/workspace/app",
        "ALLOWED_ROOTS": "/workspace/app"
      }
    }
  }
}
```

For a local build, use `node` as the command and the absolute path to
`dist/index.js` as its first argument. See the [CLI reference](docs/cli.md) for
project-root and filesystem options.

## Tools

| Tool                | Purpose                                             | Reference                               |
| ------------------- | --------------------------------------------------- | --------------------------------------- |
| `find_jsx`          | Find JSX call sites by component and prop.          | [Search](docs/find-jsx.md)              |
| `inspect_component` | Inspect declared props, types, and static defaults. | [Inspection](docs/inspect-component.md) |
| `check_jsx`         | Check required, deprecated, and forbidden props.    | [Checks](docs/check-jsx.md)             |

For saved rule files, see the [schema and examples](docs/saved-checks.md). For
filesystem restrictions, see [SECURITY.md](SECURITY.md).

## Compatibility

Existing beta clients can select `--legacy-tools` for the original tool set; see
the [CLI reference](docs/cli.md) for compatibility details.

## Development

Release maintainers: see [automatic npm publishing](docs/publishing.md) for the
one-time OIDC trusted-publisher setup and release behavior after merging to `master`.

```bash
git clone https://github.com/lmn451/jsx-prop-lookup-mcp-server.git
cd jsx-prop-lookup-mcp-server
npm install
npm run build
npm test
npm start
```

`npm run dev -- query --component Button --json` runs source directly.
`src/cli.ts` shares parsing and command execution; `src/index.ts` owns process I/O
and lifecycle. `src/server.ts` registers the modern tools, while
`src/legacy-server.ts` keeps the compatibility registrations separate.

Run the checked-in [migration and audit examples](examples/audit/README.md) to try caller search, component inspection, and saved checks with stated results.

Preview a proposed prop removal with `inspect --component Button --remove-prop variant`.
See [change impact](docs/change-impact.md) and the [runnable migration examples](examples/audit/README.md).
