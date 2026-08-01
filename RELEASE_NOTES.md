# Release Notes

## Current supported line: MCP SDK v2

The active implementation uses the official split TypeScript package `@modelcontextprotocol/server` v2 with the `2026-07-28` protocol/specification line.

### Runtime and transport

- Node.js 20 or newer is required.
- The server communicates over stdio.
- The server exposes tools only; it does not expose HTTP transport, resources, or prompts.

### Current tool set

The product exposes exactly four tools:

1. `analyze_jsx_props`
2. `find_prop_usage`
3. `get_component_props`
4. `find_components_without_prop`

### Analysis and security behavior

- Namespaced JSX such as `UI.Select` can be matched by its full dotted name or local name.
- `ALLOWED_ROOTS` and `--allowed-roots` restrict filesystem access to configured roots.
- The CLI allowed-roots setting takes precedence over the environment setting.
- Existing targets reached through symlinks are checked by their resolved location.

### Migration note

MCP v2 is the implementation target. Clients and integrations that depend on MCP v1 package paths, APIs, or protocol assumptions must migrate; there is no parallel v1 compatibility implementation.

Package release numbers and MCP SDK major versions are separate version lines. The historical package notes below do not describe the current MCP protocol target.

## Historical package releases

### v1.0.2 - EISDIR error fix

- Prevented directory paths from being read as files.
- Added directory filtering and file-type checks.
- Improved error context for problematic filesystem paths.

### v1.0.1 - Missing-prop detection

- Introduced `find_components_without_prop`.
- Reported file locations, line numbers, and existing props.
- Treated spread attributes conservatively because they may contain the required prop.

### v1.0.0 - Initial package release

- Established AST-based JSX and TSX prop analysis.
- Added component, prop-usage, TypeScript-interface, spread-attribute, and source-location analysis.
- Used Node.js ESM modules and an earlier MCP SDK generation that is now historical.

For current installation and client configuration, see [README.md](README.md) and [QUICK_START.md](QUICK_START.md).
