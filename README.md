# JSX Prop Lookup MCP Server

Analyze JSX prop usage in React/TypeScript codebases using AST parsing. Perfect for code auditing, refactoring, and understanding component prop patterns.

## ✨ What it does

- **Find prop usage** across your entire codebase
- **Analyze components** to see what props they use
- **Query components** with advanced filtering (NEW!)
- **TypeScript support** with interface analysis

## 🚀 Installation

### Use with npx (Recommended)
No installation required! Just add to your MCP client:

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

## 🔧 MCP Client Setup

### Claude Desktop
Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

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

### Cline (VS Code Extension)
Add to your Cline MCP configuration:

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

### Other MCP Clients
Use the same configuration format with your MCP client.

## 📖 Basic Usage

Once configured, you can use these commands in your MCP client:

### Analyze your entire project
```
Use analyze_jsx_props on "./src" to find all React component props
```

### Find specific prop usage
```
Use analyze_jsx_props with propName "onClick" to search for onClick props in my codebase
```

### Get component details
```
Use analyze_jsx_props with componentName "Button" to analyze the Button component
```

### Advanced component querying (NEW!)
```
Use query_components to find Button components with variant="primary" AND onClick handler
```

## 🔧 Boundary Control Features

### Project Boundaries
The `respectProjectBoundaries` parameter (default: true) prevents the analyzer from searching outside your project structure. When enabled, it stops at common project boundaries:

- **package.json** files (indicating separate npm packages)
- **.git** directories (repository boundaries)
- **node_modules** directories (dependency boundaries)
- **dist/build** directories (compiled output)

**Why use this?**
- Prevents analyzing external dependencies or unrelated projects
- Improves performance by focusing on your actual codebase
- Avoids false positives from third-party code

**Example:**
```json
{
  "name": "analyze_jsx_props",
  "arguments": {
    "path": "./",
    "respectProjectBoundaries": false,
    "componentName": "Button"
  }
}
```

### Search Depth Control
The `maxDepth` parameter (default: 10) limits how deep the analyzer searches into nested directories.

**When to adjust:**
- **Lower values (3-5)**: For focused analysis of shallow directory structures
- **Higher values (15-20)**: For deep monorepos or complex nested structures
- **Set to 1**: Analyze only the specified directory, no subdirectories

**Example:**
```json
{
  "name": "analyze_jsx_props",
  "arguments": {
    "path": "./src",
    "maxDepth": 3,
    "propName": "onClick"
  }
}
```

## 🛠️ Available Tools

### `analyze_jsx_props`
Analyze JSX prop usage in files or directories.
- **path** (required): File or directory to analyze
- **componentName** (optional): Focus on specific component
- **propName** (optional): Focus on specific prop
- **format** (optional): 'full', 'compact', or 'minimal'
- **includeTypes** (optional): Include TypeScript info (default: true)
- **includeColumns** (optional): Include column numbers (default: true)
- **includePrettyPaths** (optional): Include editor paths (default: false)
- **respectProjectBoundaries** (optional): Stay within project boundaries (default: true)
- **maxDepth** (optional): Maximum directory depth to search (default: 10)

### `query_components` ⭐ NEW
Advanced component querying with prop filtering and logic operators.
- **componentName** (required): Component to query
- **propCriteria** (required): Array of prop criteria to match
- **options** (optional): Logic ('AND'/'OR'), format, directory

**Example criteria:**
```json
{
  "componentName": "Button",
  "propCriteria": [
    { "name": "variant", "value": "primary", "operator": "equals" },
    { "name": "onClick", "exists": true }
  ],
  "options": { "logic": "AND" }
}
```

## 📊 Response Formats

Choose the format that best fits your needs:

- **full** (default): Complete analysis with all details
- **compact**: File-grouped results, 20-40% smaller
- **minimal**: Essential info only, 50-60% smaller

Example:
```json
{
  "name": "analyze_jsx_props",
  "arguments": {
    "path": "./src",
    "format": "compact"
  }
}
```

## 🎯 Common Use Cases

### Code Auditing
- Find components missing accessibility props
- Ensure consistent prop usage across components
- Identify unused or inconsistent prop patterns
- **Use boundary control** to focus on your codebase only

### Refactoring
- Find all usages of a prop before renaming
- Identify components that need prop updates
- Analyze prop dependencies before changes
- **Limit search depth** for targeted refactoring in specific modules

### Code Quality
- Find Select components without required width prop using query_components with exists: false
- Ensure Button components have onClick handlers using query_components
- Validate form components have proper props using advanced querying
- **Respect project boundaries** to avoid analyzing third-party components

### Performance Optimization
- **Use maxDepth=3** for quick shallow analysis
- **Set respectProjectBoundaries=true** to avoid scanning node_modules
- **Choose compact format** for large codebases

## 🔍 Supported Files

- `.js` - JavaScript
- `.jsx` - JavaScript with JSX  
- `.ts` - TypeScript
- `.tsx` - TypeScript with JSX

## 💡 Pro Tips

- Use **npx** for zero-maintenance setup
- Start with **compact format** for better performance
- Use **query_components** for complex filtering needs
- Combine tools for comprehensive analysis
- **Enable respectProjectBoundaries** (default) to avoid scanning dependencies
- **Adjust maxDepth** based on your project structure - lower for focused analysis, higher for deep monorepos
- **Set maxDepth=1** to analyze only the current directory without subdirectories

## 🤝 Contributing

Found a bug or have a feature request? [Open an issue](https://github.com/lmn451/jsx-prop-lookup-mcp-server/issues) on GitHub.

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.