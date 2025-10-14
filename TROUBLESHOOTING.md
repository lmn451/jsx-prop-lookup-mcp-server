# Troubleshooting MCP Error -32000

## ✅ Server Status: WORKING

Your MCP server is functioning correctly. The error -32000 "connection closed" is typically a **configuration issue**, not a server problem.

## Quick Fixes:

### 1. **Verify MCP Configuration**

Ensure your MCP client config uses exactly this format:

```json
{
  "mcpServers": {
    "jsx-prop-lookup": {
      "command": "bunx",

      "args": ["jsx-prop-lookup-mcp-server"]
    }
  }
}
```

### 2. **Test Server Manually**

```bash

# This should work without errors:

bunx jsx-prop-lookup-mcp-server

# You should see: "JSX Prop Lookup MCP Server running on stdio"

```

### 3. **Common MCP Client Locations**

**Claude Desktop:**

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`

- Windows: `%APPDATA%/Claude/claude_desktop_config.json`

**Cline (VS Code):**

- Settings → Extensions → Cline → MCP Settings

### 4. **Alternative Configurations**

If bunx doesn't work, try global installation:

```bash

bun install -g jsx-prop-lookup-mcp-server

```

Then use:

```json
{
  "mcpServers": {
    "jsx-prop-lookup": {
      "command": "jsx-prop-lookup-mcp-server"
    }
  }
}
```

### 5. **Check Requirements**

- ✅ Bun installed (check: `bun --version`)

- ✅ Internet connection (for bunx download)

## Still Having Issues?

The server is working correctly, so the issue is likely:

1. **MCP client configuration syntax**

2. **File path/permissions**

3. **MCP client compatibility**

4. **Network/firewall blocking bunx**

Try the manual test above first - if that works, it's definitely a configuration issue!
