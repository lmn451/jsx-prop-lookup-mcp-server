# Quick Start Guide

## Requirements

Install Node.js 20 or newer. The server uses the official `@modelcontextprotocol/server` v2 package and runs over stdio.

## Add the server to an MCP client

Use an absolute allowed root for the project the server should analyze:

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

Replace `/workspace/project` with the project path. The MCP client will launch the package as a stdio server.

The same restriction can be supplied as a CLI argument:

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

## Use the four tools

1. Analyze a project or file:

   ```text
   Use analyze_jsx_props with path "src" and includeTypes true.
   ```

2. Find a prop:

   ```text
   Use find_prop_usage with propName "onClick" and directory "src".
   ```

3. Inspect a component:

   ```text
   Use get_component_props with componentName "Button" and directory "src".
   ```

4. Find instances missing a prop:

   ```text
   Use find_components_without_prop with componentName "Select", requiredProp "width", and directory "src".
   ```

Paths may be absolute or relative to the server process working directory. Namespaced JSX is supported: both `UI.Select` and `Select` can target `<UI.Select />`.

## Run a local checkout

```bash
git clone https://github.com/lmn451/jsx-prop-lookup-mcp-server.git
cd jsx-prop-lookup-mcp-server
npm install
npm run build
npm start
```

A local MCP configuration can run `node dist/index.js` with the checkout as `cwd`.

## Security

Without `ALLOWED_ROOTS` or `--allowed-roots`, no filesystem whitelist is applied. Configure one of them so the server can read only intended projects. See [SECURITY.md](SECURITY.md).

## Protocol compatibility

The active target is MCP v2 on the `2026-07-28` protocol/specification line. MCP v1-only APIs and protocol assumptions are not supported as a parallel implementation.
