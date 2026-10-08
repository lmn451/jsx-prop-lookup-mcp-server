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

The server exposes six tools: the four existing analysis tools below, `find_jsx` for import-aware JSX call-site search, and `check_jsx` for rule-based prop auditing. See [Find JSX call sites](docs/find-jsx.md) and [Audit JSX props](docs/check-jsx.md) for their filters, results, and uncertainty reporting.

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

### `find_jsx` and `check_jsx`

`find_jsx` searches JSX call sites by component, import source, prop, and static value. `check_jsx` applies explicit required, deprecated, and forbidden prop rules across all selected call sites. Both report locations and snippets; uncertainty is retained in the result instead of silently treated as a definitive absence. See [Find JSX call sites](docs/find-jsx.md) and [Audit JSX props](docs/check-jsx.md) for parameters, response shapes, and rule details.

### Namespaced component names

Namespaced JSX is supported. For `<UI.Select />`, component filters may use either the full name (`UI.Select`) or the local name (`Select`). Results retain the full dotted name where applicable.

## Project setup

Choose a project once so every relative tool query is rooted there:

```bash
jsx-prop-lookup-mcp-server --project-root /workspace/app
# Equivalent: PROJECT_ROOT=/workspace/app jsx-prop-lookup-mcp-server
```

`--project-root` overrides `PROJECT_ROOT`. Add `--tsconfig configs/query.json` to select
another configuration inside the project; otherwise `tsconfig.json` at the root is
used when present. Discovery reads `.js`, `.jsx`, `.ts`, and `.tsx` files, applies
root and nested `.gitignore` rules, and then applies the configuration's effective
`files`, `include`, and `exclude` settings, including in-project `extends` files.
JavaScript inclusion follows TypeScript's `allowJs` option when a config exists.
Without a config, all four source extensions are eligible. Empty projects return
empty results. Changes to source selection and ignore rules are visible on the
next query.

An explicitly requested file follows the same discovery filters as a directory:
ignored or config-excluded files return no matches. `.git`, `node_modules`, `dist`,
and `build` directories are always excluded. Git's parent-directory rule applies:
a negation cannot restore a file while its parent directory remains ignored.

Configured projects reject paths and symlinks outside their root, including
extended configs and symlinked ignore files. `ALLOWED_ROOTS` additionally constrains
the project root. Configurations cannot inherit from outside the root; move shared
config files into the project or select a common parent workspace root.

Programmatic callers can use `new ProjectWorkspace({ root, allowedRoots, tsconfig })`
and `createServer({ root, allowedRoots, tsconfig })`. The workspace exposes a canonical
`root`, synchronous `resolve`, `readFile`, and `getCompilerOptions` methods, and async
`discover(path = '.')`. Reads recheck containment and can read in-root imported type
files even when those files are excluded from discovery. TypeScript is pinned because
the secure config host uses its file matcher against a validated directory snapshot.

For compatibility, omitting project options retains the existing CLI behavior:
paths are relative to the process working directory and only `ALLOWED_ROOTS` limits
absolute requests. The array forms `createServer(allowedRoots)` and
`new JSXPropAnalyzer(allowedRoots)` retain that behavior too. The options-object
forms default their project root to the current working directory.

## Filesystem access

All six tools read paths supplied by the MCP client. Configure a project root or
allowed roots to limit filesystem access. See [SECURITY.md](SECURITY.md) for the
root configuration and containment rules.

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

`src/index.ts` handles CLI arguments and the process lifecycle. `src/server.ts` exports `createServer(options)` to register the tools without starting a transport or adding process listeners. Tool validation and error responses use the MCP SDK.

## MCP v2 migration note

The v2 SDK and the `2026-07-28` protocol/specification line are the active implementation target. Clients or integrations built around MCP v1-only APIs or protocol assumptions must be updated; the server does not maintain a parallel v1 implementation.
