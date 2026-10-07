# JSX Prop Lookup MCP Server

An MCP server for AST-based analysis of JSX prop usage in JavaScript and TypeScript projects.

## Runtime and protocol

- Node.js 20 or newer is required.
- The server uses the official `@modelcontextprotocol/server` v2 TypeScript package.
- The active protocol/specification line is `2026-07-28`.
- Communication is over stdio. This project does not expose an HTTP transport, resources, or prompts.

## Features

- Parses `.js`, `.jsx`, `.ts`, and `.tsx` with Babel.
- Finds JSX prop usage and component prop definitions.
- Reads TypeScript prop interfaces when requested.
- Supports destructured props and identifier-based access such as `props.disabled`.
- Recognizes JSX children, optional prop access, and static computed access such as `props['disabled']`.
- Supports namespaced JSX names such as `UI.Select`.
- Restricts filesystem access when `ALLOWED_ROOTS` or `--allowed-roots` is configured.

## Installation

### Run with npx

```bash
npx --yes jsx-prop-lookup-mcp-server
```

### Install globally

```bash
npm install --global jsx-prop-lookup-mcp-server
jsx-prop-lookup-mcp-server
```

### Build from source

```bash
git clone https://github.com/lmn451/jsx-prop-lookup-mcp-server.git
cd jsx-prop-lookup-mcp-server
npm install
npm run build
npm start
```

## MCP client configuration

The recommended configuration both starts the stdio server and limits it to the project it should inspect:

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

Replace `/workspace/project` with the absolute path to the project being analyzed. An equivalent CLI configuration can pass the restriction after the package name:

```json
{
  "mcpServers": {
    "jsx-prop-lookup": {
      "command": "npx",
      "args": ["--yes", "jsx-prop-lookup-mcp-server", "--allowed-roots", "/workspace/project"]
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
      "cwd": "/workspace/jsx-prop-lookup-mcp-server",
      "env": {
        "ALLOWED_ROOTS": "/workspace/project"
      }
    }
  }
}
```

## Tools

The server exposes exactly four tools.

### `analyze_jsx_props`

Analyzes JSX props in one file or a directory.

- `path` (optional): Absolute or server-working-directory-relative file or directory. Defaults to `.`.
- `componentName` (optional): Filter by component name.
- `propName` (optional): Filter by prop name.
- `includeTypes` (optional): Include TypeScript type information. Defaults to `true`.

Example:

```json
{
  "path": "src/components",
  "componentName": "Button",
  "includeTypes": true
}
```

### `find_prop_usage`

Finds usages of a prop across JSX files.

- `propName` (required): Prop to find.
- `directory` (optional): Absolute or server-working-directory-relative directory. Defaults to `.`.
- `componentName` (optional): Limit results to a component.

Example:

```json
{
  "propName": "onClick",
  "directory": "src"
}
```

### `get_component_props`

Reports props used by a component.

- `componentName` (required): Component to analyze.
- `directory` (optional): Absolute or server-working-directory-relative directory. Defaults to `.`.

Example:

```json
{
  "componentName": "Button",
  "directory": "src/components"
}
```

### `find_components_without_prop`

Finds component instances that do not declare a required prop.

- `componentName` (required): Component to inspect.
- `requiredProp` (required): Prop that should be present.
- `directory` (optional): Absolute or server-working-directory-relative directory. Defaults to `.`.

Example:

```json
{
  "componentName": "Select",
  "requiredProp": "width",
  "directory": "src"
}
```

### Namespaced component names

Namespaced JSX is supported. For `<UI.Select />`, component filters may use either the full name (`UI.Select`) or the local name (`Select`). Results retain the full dotted name where applicable.

## Filesystem access

All four tools read paths supplied by the MCP client. Without an allowed-roots setting, no filesystem whitelist is applied.

Set a comma-separated list of allowed roots with either:

```bash
ALLOWED_ROOTS="/workspace/project,/workspace/shared" npx --yes jsx-prop-lookup-mcp-server
```

or:

```bash
npx --yes jsx-prop-lookup-mcp-server --allowed-roots "/workspace/project,/workspace/shared"
```

Absolute roots are recommended. Relative roots are resolved from the server process working directory. When both forms are present, `--allowed-roots` takes precedence. Requests outside the configured roots, including paths that resolve through a symlink to an outside location, are rejected.

Directory scans validate every discovered file and validate its target again before reading. Directory names containing glob characters, such as `[id]`, are treated literally. A discovered file outside the allowed roots fails the request.

Read and parse failures also fail the tool request with the affected filename. Fix the file or narrow the requested path before retrying; the tools do not return successful results that silently omit failed files.

See [SECURITY.md](SECURITY.md) for operating guidance.

## Development

Release maintainers: see [automatic npm publishing](docs/publishing.md) for the
one-time OIDC trusted-publisher setup and the release behavior after merging to
`master`.

```bash
npm install
npm run build
npm start
```

`npm run dev` starts the source entry point directly. Both development and built modes use stdio.

`src/index.ts` handles CLI arguments and the process lifecycle. `src/server.ts` exports `createServer(allowedRoots)` to register the tools without starting a transport or adding process listeners. Tool validation and error responses use the MCP SDK.

## MCP v2 migration note

The v2 SDK and the `2026-07-28` protocol/specification line are the active implementation target. Clients or integrations built around MCP v1-only APIs or protocol assumptions must be updated; the server does not maintain a parallel v1 implementation.
