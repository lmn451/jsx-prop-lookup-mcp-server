# Quick Start Guide

## 🚀 Use with npx (No Installation Required!)

The easiest way to use the JSX Prop Lookup MCP Server:

### 1. Add to your MCP client configuration:

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

### 2. That's it! 

The server will be automatically downloaded and run when your MCP client needs it.

## 🔧 Popular MCP Clients

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

## 📝 Example Usage

Once configured, you can use these tools in your MCP client:

1. **Analyze entire project:**
   ```
   Use the analyze_jsx_props tool on "./src" to find all React component props
   ```

2. **Find specific prop usage:**
   ```
   Use find_prop_usage to search for "onClick" prop usage in my codebase
   ```

3. **Get component props:**
   ```
   Use get_component_props to analyze the "Button" component
   ```

4. **Find missing props:**
   ```
   Use find_components_without_prop to find all "Select" components missing "width" prop
   ```

## 🎯 Benefits of npx approach:

- ✅ **No global installation** required
- ✅ **Always latest version** automatically
- ✅ **Zero maintenance** - updates happen automatically
- ✅ **Works anywhere** Node.js is installed
- ✅ **Perfect for CI/CD** environments

## 🔍 What it analyzes:

- React functional components
- TypeScript interfaces  
- JSX prop usage
- Prop destructuring
- Spread operators
- Component hierarchies
- Prop values and types
- Missing required props
- Code quality and consistency