# JSX Prop Lookup MCP Server Usage Guide

## Requirements

- Node.js 20 or newer
- An MCP client that can launch a stdio server using the MCP `2026-07-28` protocol/specification line

The server is implemented with the official `@modelcontextprotocol/server` v2 TypeScript package. It provides tools only; it does not provide HTTP transport, resources, or prompts.

## Start the server

Run the published package:

```bash
npx --yes jsx-prop-lookup-mcp-server
```

Or build and run a checkout:

```bash
npm install
npm run build
npm start
```

The process communicates with its MCP client over stdin and stdout.

## MCP integration

Use an absolute allowed root in client configuration so tool requests cannot inspect unrelated files:

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

Alternatively, pass `--allowed-roots` after the package name:

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

For a local build, use `node` with `dist/index.js` and set `cwd` to the checkout:

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

## Available tools

The current server exposes exactly these four tools.

### `analyze_jsx_props`

Analyze a JSX/TypeScript file or directory, optionally filtering by component or prop.

```json
{
  "path": "src/components",
  "componentName": "Button",
  "propName": "onClick",
  "includeTypes": true
}
```

`path` defaults to `.`. `componentName` and `propName` are optional, and `includeTypes` defaults to `true`.

### `find_prop_usage`

Find every usage of a named prop, optionally restricted to a component.

```json
{
  "propName": "onClick",
  "directory": "src",
  "componentName": "Button"
}
```

`propName` is required. `directory` defaults to `.` and `componentName` is optional.

### `get_component_props`

Inspect the props used by a component.

```json
{
  "componentName": "Button",
  "directory": "src/components"
}
```

`componentName` is required. `directory` defaults to `.`.

### `find_components_without_prop`

Find component instances that do not declare a required prop.

```json
{
  "componentName": "Select",
  "requiredProp": "width",
  "directory": "src"
}
```

`componentName` and `requiredProp` are required. `directory` defaults to `.`.

## Paths and namespaced JSX

Tool paths may be absolute or relative to the server process working directory. When allowed roots are configured, the resolved target must remain inside one of them.

Namespaced JSX names are supported. A component input of either `UI.Select` or `Select` can match `<UI.Select />`; results preserve the full dotted name where applicable.

## Filesystem restrictions

`ALLOWED_ROOTS` and `--allowed-roots` accept comma-separated absolute or working-directory-relative roots. The CLI flag takes precedence over the environment variable. If neither is set, the server has no filesystem whitelist, so a restriction is recommended for normal use.

For example:

```bash
ALLOWED_ROOTS="/workspace/project" npx --yes jsx-prop-lookup-mcp-server
```

See [SECURITY.md](SECURITY.md) for details.

## MCP v2 migration

MCP v2 is the active implementation line. Integrations that assume MCP v1 package paths, APIs, or protocol behavior are not the implementation target and must migrate before using this server.
