# Changelog

## [4.0.0] - Unreleased

### Changed

- Migrated the server to the official TypeScript MCP v2 package, `@modelcontextprotocol/server@2.3.1`.
- Adopted the `2026-07-28` MCP protocol/specification line with modern-only stdio negotiation.
- Raised the minimum Node.js version from 18 to 20.
- Replaced the legacy `server.tool()` API with `server.registerTool()`.
- Upgraded Babel, glob, Zod, TypeScript, ESLint, Prettier, and related development dependencies.
- Migrated ESLint to the flat configuration used by ESLint 10.
- Simplified the CLI/server entry point with built-in argument parsing, shared tool-response handling, and direct startup/shutdown. Invalid CLI arguments now fail before startup.
- Read and parse failures now return tool errors with the failed filename instead of successful, incomplete results.
- Package builds now include only the active runtime modules and release documentation; stale tests and disconnected analytics helpers are excluded.

### Fixed

- Count JSX attributes once inside fragments, including nested fragments.
- Recognize JSX children in prop searches and required-prop checks.
- Respect parameter bindings when finding prop access inside closures and callbacks.
- Handle static computed access, optional chaining, and defaulted props parameters.
- Associate prop type declarations regardless of their position in the file.
- Restore the missing configuration API for the optional, disconnected request logger.

### Security

- Enforce `ALLOWED_ROOTS` and `--allowed-roots` on every discovered file and again before reading; reject symlinks that escape the allowed roots.
- Treat requested directories as literal paths so glob characters cannot redirect scans to other directories.
- Removed hardcoded API credentials from the local MCP configuration.

### Testing

- Replaced the hand-written legacy MCP wire test with official v2 client/stdio integration coverage.
- Preserved analyzer, allowed-root, namespaced JSX, and expression-value regression coverage.
- Test the compiled entry point and add regressions for containment escapes, analysis correctness, and parse errors across all four tools.

## [3.5.0] - 2026-02-10

- Latest published npm release before the 4.0.0 upgrade, using `@modelcontextprotocol/sdk` v1 and the same four analysis tools.

Historical entries below describe older package releases and may mention APIs that are not part of the current four-tool product.

## [1.3.0] - 2024-07-23

### Added

- **NEW TOOL**: `query_components` - Advanced component querying with prop value filtering and complex logic
  - **Prop Criteria System**: Define complex prop matching rules with value comparison and existence checks
  - **Operators**: Support for 'equals' and 'contains' operators for flexible value matching
  - **Logic Modes**: AND/OR logic for combining multiple criteria
  - **Rich Results**: Returns matching props, missing props, and complete prop information
  - **Format Support**: Full compatibility with all response formats (full, compact, minimal)

### Features

- **Prop Criteria Matching**:
  - Value-based filtering: `{ name: "variant", value: "primary", operator: "equals" }`
  - Existence checking: `{ name: "onClick", exists: true }`
  - Contains matching: `{ name: "placeholder", value: "email", operator: "contains" }`
- **Complex Logic**: Combine criteria with AND/OR logic for sophisticated queries
- **Comprehensive Results**: Each match includes matching props, missing props, and all props for context
- **Performance Optimized**: Efficient prop evaluation with minimal overhead

### Use Cases

- Find Button components with variant="primary" AND onClick handler
- Find Input components with email-related props (type="email" OR placeholder contains "email")
- Audit components for required prop combinations
- Complex component filtering and analysis

### Removed

- **Similarity Tools**: Removed `find_similar_components` and `find_select_with_props` tools
- **Similarity Interfaces**: Cleaned up PropSimilarityOptions, ComponentSimilarity interfaces
- **SELECT_OPTIMIZATION.md**: Removed similarity-focused documentation

### Technical

- **New Interfaces**: PropCriterion, ComponentQueryOptions, ComponentQuery, QueryResult, ComponentQueryResult
- **Enhanced Testing**: Added 10 comprehensive test cases covering all query scenarios
- **Updated Documentation**: Complete examples and usage patterns in README.md and USAGE.md
- **Type Safety**: Full TypeScript support with proper type definitions

### Migration

- Replace similarity-based searches with equivalent query_components calls
- All existing tools remain unchanged and backward compatible
- New tool provides more powerful and flexible component searching

## [1.1.0] - 2024-07-23

### Added

- **Multiple Response Formats**: Choose from full, compact, or minimal response formats
  - `full` (default): Complete analysis with all information
  - `compact`: File-grouped results, 20-40% smaller response size
  - `minimal`: Prop-focused results, 50-60% smaller response size
- **Editor Integration**: New `prettyPath` field for deep-linking to specific files and lines
  - VS Code compatible format: `./src/Button.tsx:15:20`
  - Supports file-only, file:line, and file:line:column formats
- **Configurable Output Options**:
  - `includeColumns`: Control column number inclusion (default: true)
  - `includePrettyPaths`: Enable editor-compatible paths (default: false)
- **Performance Optimizations**:
  - Compact JSON output option (no pretty-printing)
  - Reduced redundancy in compact format
  - Optimized response structures for different use cases
- **Comprehensive Test Suite**: Added 6 new test cases covering all response formats
- **Enhanced Documentation**:
  - New `RESPONSE_FORMATS.md` with detailed format explanations
  - Updated README with format examples
  - Enhanced USAGE.md with practical examples

### Changed

- **Tool Parameters**: All tools now accept format and output control parameters
- **Response Structure**: Enhanced with optional prettyPath fields
- **API Signatures**: Updated method signatures to support new options (backward compatible)

### Performance Improvements

- **Response Size**: Up to 60% reduction with minimal format
- **Network Transfer**: 25-30% faster with compact JSON
- **Memory Usage**: 20-35% reduction with optimized formats

### Migration

- All changes are backward compatible
- Existing tool calls continue to work unchanged
- New parameters are optional with sensible defaults

## [1.0.4] - Previous Release

- Fixed EISDIR errors and improved file handling
- Enhanced error reporting and graceful failure handling
- Improved test coverage and reliability

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
