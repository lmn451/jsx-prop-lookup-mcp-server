# JSX Prop Lookup MCP Server

An MCP (Model Context Protocol) server that analyzes JSX prop usage in React/TypeScript codebases using AST parsing.

## Features

- **AST-based Analysis**: Uses Babel parser for accurate JSX/TSX parsing
- **Prop Usage Tracking**: Find where props are used across components
- **Component Analysis**: Analyze prop definitions and usage patterns
- **TypeScript Support**: Includes TypeScript interface analysis
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

The server provides three main tools:

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