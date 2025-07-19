# Changelog

All notable changes to the JSX Prop Lookup MCP Server will be documented in this file.

## [1.0.2] - 2024-07-19

### Fixed
- **EISDIR Error**: Resolved "illegal operation on directory, read" crashes when encountering directories named like files
- Enhanced file system handling with multiple safety checks
- Improved error messages and debugging information

### Changed
- Added `nodir: true` to glob options for better file discovery
- Multiple `statSync()` verification layers before file operations
- Enhanced TypeScript error typing throughout codebase
- Better warning system for problematic file paths

## [1.0.1] - 2024-07-19

### Added
- **New Tool**: `find_components_without_prop` for finding components missing required props
- Smart spread operator handling (assumes spreads might contain required props)
- Detailed missing prop analysis with file locations and existing props
- Summary statistics with percentages for missing props

### Use Cases
- Find Select components without width prop
- Identify Button components missing onClick handlers
- Audit accessibility props across components
- Ensure consistent prop usage across codebase

## [1.0.0] - 2024-07-19

### Added
- Initial release of JSX Prop Lookup MCP Server
- **Core Tools**:
  - `analyze_jsx_props` - Comprehensive JSX prop analysis
  - `find_prop_usage` - Search for specific prop usage
  - `get_component_props` - Extract all props for a component
- AST-based analysis using Babel parser
- React/TypeScript support with full JSX/TSX parsing
- TypeScript interface detection for prop types
- Spread operator handling (`...rest`, `...spread`)
- Line/column location tracking for all findings
- Prop value extraction (strings, expressions, identifiers)
- MCP SDK v0.4.0 integration
- npx support for easy installation
- Comprehensive documentation and troubleshooting guides

### Technical Details
- Node.js 18+ requirement with version checking
- ESM modules with TypeScript compilation
- Robust error handling and graceful shutdown
- Support for complex component hierarchies
- Production-ready with extensive testing