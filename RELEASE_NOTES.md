# Release Notes

## v1.0.0 - Initial Release

### Features
- ✅ **Complete MCP Server** for JSX prop analysis using AST parsing
- ✅ **Three Analysis Tools**:
  - `analyze_jsx_props` - Comprehensive prop analysis
  - `find_prop_usage` - Search specific prop usage
  - `get_component_props` - Extract component props
- ✅ **React/TypeScript Support** - Full JSX/TSX parsing
- ✅ **Babel AST Parser** - Accurate code analysis
- ✅ **TypeScript Interface Detection** - Prop type information
- ✅ **Spread Operator Handling** - `...rest` and `...spread` props
- ✅ **Location Tracking** - Line/column information for all findings
- ✅ **Prop Value Extraction** - String literals, expressions, identifiers

### Technical Details
- Built with MCP SDK v0.4.0
- Babel parser with comprehensive plugin support
- TypeScript compilation target: ES2022
- Node.js ESM modules

### Tested With
- React functional components
- TypeScript interfaces
- Arrow functions and function declarations
- JSX prop destructuring
- Spread operators
- Complex component hierarchies

### Ready For
- Production use
- Integration with MCP clients
- Large React codebases
- Development tooling

**Installation:** `npm install jsx-prop-lookup-mcp-server`