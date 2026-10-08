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

The default server exposes exactly three read-only tools: `find_jsx`,
`inspect_component`, and `check_jsx`. It uses the official MCP v2 TypeScript SDK,
protocol line `2026-07-28`, and stdio. Protocol output goes to stdout; logs go to
stderr. There is no HTTP transport, resource API, or prompt API.

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
`dist/index.js` as its first argument. `--project-root /workspace/app` can replace
`PROJECT_ROOT`; command-line roots take precedence over environment settings.

## Tools

See the detailed references for [JSX search](docs/find-jsx.md),
[component inspection](docs/inspect-component.md), and [rule checks](docs/check-jsx.md).

All three tools accept a project-relative `path` (default `.`), `offset` (default
`0`), and `limit` (default `100`, maximum `500`). Results contain sorted located
`matches`, `total`, `nextOffset`, `unresolved`, and `complete`. Unknown information
is explicit, so an incomplete analysis cannot silently appear to be a clean audit.

| Tool                | Purpose                                                            | Additional arguments                                                      |
| ------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `find_jsx`          | Find JSX call sites by component identity and props.               | Optional `component`, `source`, `prop`, `value`; `value` requires `prop`. |
| `inspect_component` | Inspect declared props, types, documentation, and static defaults. | Required `component`; optional `source`.                                  |
| `check_jsx`         | Report missing, deprecated, and forbidden props at JSX call sites. | Required nonempty `rules` array.                                          |

Component searches recognize import aliases and original exports. Source filters
disambiguate imported components. Static values are reported when known; spreads,
unresolved imports, types, and expressions retain explicit uncertainty. Inspection
can resolve prop declarations that appear after a component or in imported files.

An inline check request can use:

```json
{
  "path": "src",
  "rules": [{ "id": "button-label", "component": "Button", "required": ["label"] }]
}
```

Check results include `summary: { status, findings, unresolved }`, with status
`pass`, `fail`, or `incomplete`. The CLI `check --rules FILE` reads those rules from
a strict `{ "version": 1, "rules": [...] }` document and returns exit `0`, `1`, or
`2` respectively. Incomplete results take precedence over known findings.

## Project setup and filesystem access

`--project-root` overrides `PROJECT_ROOT`; the modern CLI and MCP server otherwise
use the process working directory. Relative requests always start at that fixed
root. `--tsconfig configs/query.json` selects another in-project configuration;
otherwise root `tsconfig.json` is used when present.

Discovery reads `.js`, `.jsx`, `.ts`, and `.tsx`, applies root and nested
`.gitignore` rules, then applies effective TypeScript `files`, `include`, and
`exclude` settings, including in-project `extends`. JavaScript inclusion follows
`allowJs` when a config exists; without a config all four extensions are eligible.
`.git`, `node_modules`, `dist`, and `build` directories are excluded. Ignored or
config-excluded explicit files return no matches. A negation cannot restore a file
whose parent directory remains ignored. Empty projects return empty selections.
Changes to source selection and ignore rules are visible on the next query.

Paths, symlinks, ignore files, and configuration inheritance must stay inside the
project. `ALLOWED_ROOTS` or `--allowed-roots` adds a comma-separated allowlist and
also constrains the configured project root. CLI values override environment
values. Relative allowed roots resolve from the process working directory.
Reads recheck containment; imported declaration files can be read inside the root
even when excluded from discovery. See [SECURITY.md](SECURITY.md).

Programmatic callers can use `new ProjectWorkspace({ root, allowedRoots, tsconfig })`.
The workspace exposes a canonical `root`, synchronous `resolve`, `readFile`, and
`getCompilerOptions` methods, and async `discover(path = '.')`. TypeScript is pinned
because the secure config host uses its file matcher against a validated directory
snapshot.

## Compatibility

Existing beta clients can select `--legacy-tools` to expose the original four
tools: `analyze_jsx_props`, `find_prop_usage`, `get_component_props`, and
`find_components_without_prop`. Their original schemas remain available in this
explicit mode. Without project options, it preserves working-directory-relative
queries and the legacy allowed-roots policy. The legacy analyzer library remains
available. This compatibility mode still uses MCP v2, not the MCP v1 protocol.

`createServer()` and `createServer({ root, allowedRoots, tsconfig })` expose the
modern tools using one `ProjectWorkspace`. `createServer({ legacyTools: true })`
selects the old tools, and the array form `createServer(allowedRoots)` remains
legacy-compatible. Importing or creating a server does not start a transport or
attach process listeners.

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
