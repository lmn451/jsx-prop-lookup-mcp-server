# JSX Prop Analyzer (CLI & MCP Server)

A command-line tool and MCP (Model Context Protocol) server for analyzing JSX prop usage in React/TypeScript codebases using AST parsing.

This tool can be used as a standalone CLI (`jsx-analyzer`) or as an MCP server (`jsx-prop-lookup-mcp-server`).

## Features

- **AST-based Analysis**: Uses Babel parser for accurate JSX/TSX parsing
- **Prop Usage Tracking**: Find where props are used across components
- **Component Analysis**: Analyze prop definitions and usage patterns
- **TypeScript Support**: Includes TypeScript interface analysis
- **Multiple Search Options**: Search by component, prop name, or analyze entire directories

## Installation

### Standalone CLI

```bash
npm install -g jsx-prop-lookup-mcp-server

# Now you can use the jsx-analyzer command
jsx-analyzer --help
```

### MCP Server

#### Option 1: Use with npx (Recommended)
No installation required! Use directly with npx:

```bash
npx jsx-prop-lookup-mcp-server
```

#### Option 2: Install Globally
```bash
npm install -g jsx-prop-lookup-mcp-server
jsx-prop-lookup-mcp-server
```

#### Option 3: Development Setup
```bash
git clone https://github.com/lmn451/jsx-prop-lookup-mcp-server.git
cd jsx-prop-lookup-mcp-server
npm install
npm run build
npm start
```

## Standalone CLI Usage

The `jsx-analyzer` command allows you to perform analysis directly from your terminal.

**Commands:**

- `analyze_jsx_props`: Analyze JSX prop usage in files or directories.
  - `jsx-analyzer analyze_jsx_props --path <file_or_dir> [--componentName <name>] [--propName <name>]`

- `find_prop_usage`: Find all usages of a specific prop across JSX files.
  - `jsx-analyzer find_prop_usage --propName <prop_name> --path <directory>`

- `get_component_props`: Get all props used by a specific component.
  - `jsx-analyzer get_component_props --componentName <component_name> --path <directory>`

- `find_components_without_prop`: Find component instances that are missing a required prop.
  - `jsx-analyzer find_components_without_prop --componentName <name> --requiredProp <prop> --path <directory>`

## MCP Server Usage

The server provides four main tools:

### 1. `analyze_jsx_props`
Analyze JSX prop usage in files or directories.

**Parameters:**
- `path` (required): File or directory path to analyze
- `componentName` (optional): Specific component name to analyze
- `propName` (optional): Specific prop name to search for
- `includeTypes` (optional): Include TypeScript type information (default: true)

### 2. `find_prop_usage`
Find all usages of a specific prop across JSX files.

**Parameters:**
- `propName` (required): Name of the prop to search for
- `directory` (optional): Directory to search in (default: ".")
- `componentName` (optional): Limit search to specific component

### 3. `get_component_props`
Get all props used by a specific component.

**Parameters:**
- `componentName` (required): Name of the component to analyze
- `directory` (optional): Directory to search in (default: ".")

### 4. `find_components_without_prop`
Find component instances that are missing a required prop (e.g., Select components without width prop).

**Parameters:**
- `componentName` (required): Name of the component to check (e.g., "Select")
- `requiredProp` (required): Name of the required prop (e.g., "width")
- `directory` (optional): Directory to search in (default: ".")

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