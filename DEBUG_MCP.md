# MCP Connection Debugging Guide

## ✅ Server Status: Working Correctly

The test shows the server is responding properly:
- ✅ Starts successfully
- ✅ Responds to initialize message
- ✅ Returns proper capabilities
- ✅ Handles shutdown gracefully

## Common MCP Error -32000 "Connection Closed" Causes:

### 1. **Incorrect MCP Configuration**
Make sure your MCP client config is exactly:

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

### 2. **Node.js Path Issues**
If npx fails, try absolute paths:

```json
{
  "mcpServers": {
    "jsx-prop-lookup": {
      "command": "/usr/local/bin/node",
      "args": ["/path/to/jsx-prop-lookup-mcp-server/dist/index.js"]
    }
  }
}
```

### 3. **Permission Issues**
Ensure the binary is executable:
```bash
chmod +x dist/index.js
```

### 4. **Working Directory**
Some MCP clients need explicit working directory:

```json
{
  "mcpServers": {
    "jsx-prop-lookup": {
      "command": "npx",
      "args": ["jsx-prop-lookup-mcp-server"],
      "cwd": "/your/project/directory"
    }
  }
}
```

## Testing Steps:

### 1. **Test Server Directly**
```bash
node dist/index.js
# Should show: "JSX Prop Lookup MCP Server running on stdio"
# Press Ctrl+C to exit
```

### 2. **Test with npx**
```bash
npx jsx-prop-lookup-mcp-server
# Should download and run the server
```

### 3. **Test MCP Protocol**
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | npx jsx-prop-lookup-mcp-server
```

## Client-Specific Configurations:

### Claude Desktop
File: `~/Library/Application Support/Claude/claude_desktop_config.json`

### Cline (VS Code)
Add to Cline MCP settings in VS Code

### Custom MCP Client
Ensure your client implements the MCP protocol correctly

## If Still Having Issues:

1. **Check Node.js version**: `node --version` (requires Node 18+)
2. **Check npm/npx**: `npx --version`
3. **Try local installation**: `npm install -g jsx-prop-lookup-mcp-server`
4. **Check MCP client logs** for more specific error details
5. **Verify MCP client supports protocol version 2024-11-05**