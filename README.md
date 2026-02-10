# JSX Prop Lookup MCP Server

An MCP (Model Context Protocol) server that analyzes JSX prop usage in React/TypeScript codebases using AST parsing.

## Features

- **AST-based Analysis**: Uses Babel parser for accurate JSX/TSX parsing
- **Prop Usage Tracking**: Find where props are used across components
- **Component Analysis**: Analyze prop definitions and usage patterns (supports destructuring and identifier-based props access in function/arrow components)
- **TypeScript Support**: Includes TypeScript interface analysis
- **Identifier Param Support**: Detects props accessed via identifier parameters (not just destructured), e.g., `p.onClick` and `buttonProps.disabled` inside function/arrow component bodies
- **Multiple Search Options**: Search by component, prop name, or analyze entire directories

## Installation

### Option 1: Use with npx (Recommended)

No installation required! Use directly with npx:

```bash
npx jsx-prop-lookup-mcp-server
```

### Option 2: Install Globally

```bash
npm install -g jsx-prop-lookup-mcp-server
jsx-prop-lookup-mcp-server
```

### Option 3: Development Setup

```bash
git clone https://github.com/your-username/jsx-prop-lookup-mcp-server.git
cd jsx-prop-lookup-mcp-server
npm install
npm run build
npm start
```

## Usage

The server provides four main tools:

### 1. `analyze_jsx_props`

Analyze JSX prop usage in files or directories.

**Parameters:**

- `path` (required): File or directory path to analyze
- `componentName` (optional): Specific component name to analyze
- `propName` (optional): Specific prop name to search for
- `includeTypes` (optional): Include TypeScript type information (default: true)

### 2. `find_prop_usage`

Find all usages of a specific prop across JSX files. The `directory` must be an absolute path.

**Parameters:**

- `propName` (required): Name of the prop to search for
- `directory` (optional): Directory to search in (default: "."). Must be an absolute path.
- `componentName` (optional): Limit search to specific component

### 3. `get_component_props`

Get all props used by a specific component. The `directory` must be an absolute path.

**Parameters:**

- `componentName` (required): Name of the component to analyze
- `directory` (optional): Directory to search in (default: "."). Must be an absolute path.

### 4. `find_components_without_prop`

Find component instances that are missing a required prop (e.g., Select components without width prop). The `directory` must be an absolute path.

**Parameters:**

- `componentName` (required): Name of the component to check (e.g., "Select")
- `requiredProp` (required): Name of the required prop (e.g., "width")
- `directory` (optional): Directory to search in (default: "."). Must be an absolute path.

## Example Output

```json
{
  "summary": {
    "totalFiles": 5,
    "totalComponents": 3,
    "totalProps": 12
  },
  "components": [
    {
      "componentName": "Button",
      "file": "./src/Button.tsx",
      "props": [
        {
          "propName": "onClick",
          "componentName": "Button",
          "file": "./src/Button.tsx",
          "line": 5,
          "column": 10
        }
      ],
      "propsInterface": "ButtonProps"
    }
  ],
  "propUsages": [
    {
      "propName": "className",
      "componentName": "Button",
      "file": "./src/App.tsx",
      "line": 15,
      "column": 20,
      "value": "btn-primary"
    }
  ]
}
```

### Component name matching

- Namespaced JSX components (e.g., `UI.Select`) are supported. You can target either the full dotted name (e.g., `UI.Select`) or the local component name (e.g., `Select`) in tool inputs. Results record the full dotted name where applicable.

## Supported File Types

- `.js` - JavaScript
- `.jsx` - JavaScript with JSX
- `.ts` - TypeScript
- `.tsx` - TypeScript with JSX

## MCP Client Configuration

### Using with npx (Recommended)

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "jsx-prop-lookup": {
      "command": "npx",
      "args": ["jsx-prop-lookup-mcp-server"]
    }
  }
}
```

### Using with global installation

```json
{
  "mcpServers": {
    "jsx-prop-lookup": {
      "command": "jsx-prop-lookup-mcp-server"
    }
  }
}
```

### Using with local development

```json
{
  "mcpServers": {
    "jsx-prop-lookup": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "/path/to/jsx-prop-lookup-mcp-server"
    }
  }
}
```

## Development

```bash
npm run dev  # Run in development mode
npm run build  # Build for production
npm start  # Run built version
```

## Security and safe operation

Important: this MCP server reads files and directories on disk based on client-provided paths. Do NOT expose the stdio-based server to untrusted or network-exposed clients. By default there is no filesystem whitelist; to restrict filesystem access, set the `ALLOWED_ROOTS` environment variable to a comma-separated list of allowed root directories (absolute or workspace-relative). When configured, any tool request that refers to a path outside the allowed roots will be rejected.

Example (restrict to the repository root):

```bash
export ALLOWED_ROOTS="."
npm run dev
```

Recommended practices:

- Run this server only in trusted environments, or behind an authenticated proxy.
- Use `ALLOWED_ROOTS` to limit the scope of accessible files.
- Do not run the server as a privileged user; run under a least-privileged account.
- Consider further sandboxing (containerization) when servicing untrusted inputs.
