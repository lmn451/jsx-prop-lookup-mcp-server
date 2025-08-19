# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Overview

This is an MCP (Model Context Protocol) server that analyzes JSX prop usage in React/TypeScript codebases using AST parsing. The server provides four main tools for analyzing React component props, interfaces, and usage patterns across JavaScript and TypeScript files.

## Project Architecture

The codebase follows a clean, focused architecture with two core source files:

- **`src/index.ts`**: Main MCP server entry point that implements the Model Context Protocol. Handles tool registration, request routing, and response formatting. Connects to MCP clients via stdio transport and delegates analysis work to the JSXPropAnalyzer class.

- **`src/jsx-analyzer.ts`**: Core analysis engine containing the `JSXPropAnalyzer` class. Uses Babel parser with TypeScript and JSX plugins to build ASTs, then traverses them to extract prop usage, component definitions, and TypeScript interfaces. Handles file system operations, glob patterns, and result aggregation.

The server is distributed as a CLI tool via npm and designed to be run through `npx` for zero-installation usage with MCP clients like Claude Desktop and Cline.

## Common Development Commands

### Setup and Dependencies
```bash
npm install                 # Install all dependencies
```

### Development and Building
```bash
npm run dev                 # Run in development mode with tsx
npm run build               # Build TypeScript to dist/ directory
npm start                   # Run built version from dist/index.js
```

### Testing the MCP Server
```bash
# Test server directly
node dist/index.js

# Test with npx (after publishing)
npx jsx-prop-lookup-mcp-server

# Test MCP protocol manually
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}}}' | npx jsx-prop-lookup-mcp-server
```

### Publishing Workflow
```bash
npm login                   # Login to npm registry
npm publish                 # Publish to npm
git push origin main        # Push to GitHub
```

## MCP Tools Available

The server provides four analysis tools:

1. **`analyze_jsx_props`** - Comprehensive analysis of JSX props in files or directories
2. **`find_prop_usage`** - Find all usages of a specific prop across JSX files  
3. **`get_component_props`** - Get all props used by a specific component
4. **`find_components_without_prop`** - Find component instances missing required props

## Supported File Types

The analyzer processes these file extensions:
- `.js` - JavaScript
- `.jsx` - JavaScript with JSX
- `.ts` - TypeScript  
- `.tsx` - TypeScript with JSX

## Key Technical Details

### AST Parsing Configuration
The analyzer uses Babel parser with these plugins:
- jsx, typescript, decorators-legacy, classProperties
- objectRestSpread, functionBind, exportDefaultFrom
- exportNamespaceFrom, dynamicImport, nullishCoalescingOperator, optionalChaining

### File Discovery
Uses glob patterns `**/*.{js,jsx,ts,tsx}` with exclusions for:
- `**/node_modules/**`
- `**/dist/**` 
- `**/build/**`

### Component Analysis Features
- Function component prop extraction (destructuring and props.x patterns)
- Arrow function component analysis
- TypeScript interface detection (XxxProps naming convention)
- JSX element prop usage with value extraction
- Spread operator handling
- Line/column location tracking

## Adding New Features

When extending the analyzer:

1. **New analysis methods** should be added to the `JSXPropAnalyzer` class in `jsx-analyzer.ts`
2. **New MCP tools** require updates to both tool registration and request handling in `src/index.ts`
3. **New AST traversal patterns** should follow the existing Babel traverse structure
4. **Interface changes** should be made to the TypeScript interfaces at the top of `jsx-analyzer.ts`

## Configuration Files

- **`tsconfig.json`**: TypeScript configuration targeting ES2022 with ESNext modules
- **`package.json`**: Defines npm scripts, dependencies, and CLI binary entry point
- **`mcp-config.json`**: Sample MCP client configuration for testing

## Additional Resources

- `README.md` - Main documentation and usage examples
- `QUICK_START.md` - Fast setup guide for MCP clients
- `USAGE.md` - Detailed usage examples and tool descriptions  
- `DEBUG_MCP.md` - Troubleshooting guide for MCP connection issues
- `PUBLISH.md` - Step-by-step publishing workflow
- `TROUBLESHOOTING.md` - Common issues and solutions

## Node.js Requirements

Requires Node.js 18 or higher (enforced in `src/index.ts` startup check).
