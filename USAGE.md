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
4. **query_components** ⭐ **NEW** - Advanced component querying with prop value filtering and complex logic
5. **find_components_without_prop** - Find components missing required props (e.g., Select without width)

## Response Format Options

### Format Types
- **full** (default): Complete analysis with all information
- **compact**: File-grouped results, 20-40% smaller
- **minimal**: Prop-focused results, 50-60% smaller

### Additional Options
- **includePrettyPaths**: Add editor-compatible file paths (e.g., `./src/Button.tsx:15:20`)
- **includeColumns**: Control column number inclusion in location data

### Usage Examples

#### Basic Usage (Full Format)
```json
{
  "name": "analyze_jsx_props",
  "arguments": {
    "path": "./src"
  }
}
```

#### Compact Format with Pretty Paths
```json
{
  "name": "analyze_jsx_props",
  "arguments": {
    "path": "./src",
    "format": "compact",
    "includePrettyPaths": true
  }
}
```

#### Minimal Format for Quick Lookups
```json
{
  "name": "find_prop_usage",
  "arguments": {
    "propName": "onClick",
    "format": "minimal",
    "includeColumns": false
  }
}
```

#### Advanced Component Querying (NEW)
```json
{
  "name": "query_components",
  "arguments": {
    "componentName": "Button",
    "propCriteria": [
      { "name": "variant", "value": "primary", "operator": "equals" },
      { "name": "onClick", "exists": true }
    ],
    "options": { "logic": "AND", "includePrettyPaths": true }
  }
}
```

#### Find Components with Email-Related Props (OR Logic)
```json
{
  "name": "query_components",
  "arguments": {
    "componentName": "Input",
    "propCriteria": [
      { "name": "type", "value": "email", "operator": "equals" },
      { "name": "placeholder", "value": "email", "operator": "contains" }
    ],
    "options": { "logic": "OR", "format": "compact" }
  }
}
```

## Performance Optimizations

The server is ready for production use!