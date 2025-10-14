# Release Notes

## v3.4.0 - Modernization & Performance

This release focuses on modernizing the toolchain, improving performance, and enhancing the developer experience.

### Features & Improvements

- ✅ **Standalone CLI**: Added a new `jsx-analyzer` command-line interface for usage without an MCP client.
- ✅ **Bun Migration**: Migrated the entire project from npm/pnpm to [Bun](https://bun.sh/) for faster package management, testing, and script execution.
- ✅ **Performance Boost**: Replaced the `tsc` build process with Bun's much faster bundler, resulting in a >14% speedup in test execution and quicker builds.
- ✅ **Dependency Updates**: Upgraded all project dependencies to their latest versions, including a major upgrade of the `@modelcontextprotocol/sdk`.
- ✅ **Test Suite**: Added a comprehensive test suite using Vitest, covering both the core analyzer logic and the new standalone CLI.
- ✅ **Documentation Overhaul**: Updated all documentation to reflect the new Bun-based workflow and tooling.

### Technical Details

- Runtime: Bun
- Package Manager: Bun
- Build Tool: Bun bundler + tsc for types
- Test Runner: Vitest



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
