# Quick Start Guide

This project can be used as a standalone CLI or as an MCP server.

## 🚀 Standalone CLI (Recommended)

The easiest way to use the tool is with the `jsx-analyzer` command-line interface.

### 1. Install the CLI:

```bash
bun install -g jsx-prop-lookup-mcp-server
```

### 2. Run a command:

```bash
# Get help
jsx-analyzer --help

# Analyze props in the current directory
jsx-analyzer analyze_jsx_props --path .

# Find where a specific prop is used
jsx-analyzer find_prop_usage --propName onClick --path ./src
```

## 🔧 MCP Server Usage

If you want to use the tool as an MCP server, you can do so with `npx` or by running it directly.

### Add to your MCP client configuration:

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

Once configured, you can use the tools (`analyze_jsx_props`, `find_prop_usage`, etc.) in your MCP client.
