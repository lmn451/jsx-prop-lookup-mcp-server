# JSX Prop Lookup MCP Server Usage Guide

## Quick Start

### Option 1: Use with npx (Recommended)
```bash
npx jsx-prop-lookup-mcp-server
```

### Option 2: Development Setup
1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Build the server:**
   ```bash
   npm run build
   ```

3. **Test the server:**
   ```bash
   npm start
   ```

## Example Usage

The server successfully analyzes JSX prop usage as demonstrated with the sample components:

### Sample Analysis Results

**Button Component Props:**
- `children`, `onClick`, `disabled`, `variant`, `className`, `...rest`
- Includes TypeScript interface: `ButtonProps`

**onClick Prop Usage Found:**
- Button component definition (parameter destructuring)
- Button JSX element usage in App component
- Native button element in Button component

**Key Features Demonstrated:**
- ✅ AST-based parsing of JSX/TSX files
- ✅ Component prop extraction from function parameters
- ✅ JSX element prop usage tracking
- ✅ TypeScript interface detection
- ✅ Spread operator handling
- ✅ Line/column location tracking
- ✅ Prop value extraction (strings, expressions)
- ✅ Missing prop detection for code auditing
- ✅ Robust file system handling (no EISDIR errors)

## MCP Integration

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

## Available Tools

1. **analyze_jsx_props** - Comprehensive analysis of JSX props in files/directories
2. **find_prop_usage** - Find specific prop usage across codebase
3. **get_component_props** - Get all props for a specific component
4. **find_components_without_prop** - Find components missing required props (e.g., Select without width)

The server is ready for production use!