# Release Notes

## v1.0.2 - EISDIR Error Fix (Latest)

### 🐛 Critical Bug Fix
- **Fixed EISDIR Error**: Resolved "illegal operation on directory, read" crashes
- **Enhanced File Handling**: Multiple safety checks for directory detection
- **Robust Analysis**: Gracefully handles complex file system structures
- **Better Error Messages**: Improved debugging with detailed error context

### 🔧 Technical Improvements
- Added `nodir: true` to glob options
- Multiple `statSync()` verification layers
- Proper TypeScript error typing
- Enhanced warning system for problematic paths

## v1.0.1 - Missing Props Detection

### ✨ New Feature
- **find_components_without_prop**: Find components missing required props
- **Code Auditing**: Perfect for ensuring consistent prop usage
- **Smart Spread Handling**: Assumes spread operators might contain required props
- **Detailed Results**: File locations, line numbers, and existing props listed

### 📊 Use Cases
- Find Select components without width prop
- Identify Button components missing onClick handlers
- Audit accessibility props across components

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
