# Test Infrastructure

This project uses Node.js built-in test runner for testing. The test suite verifies both the JSX analyzer functionality and the MCP server integration.

## Test Structure

### Unit & Integration Tests

- `tests/analyzer.test.js` - Tests the core JSXPropAnalyzer functionality
  - Positive tests: Expected findings in example components
  - Negative tests: Non-existent components/props should return empty results
  - Error handling: Invalid paths, empty directories
  - TypeScript interface detection
  - Spread operator handling

### MCP Integration Tests

- `tests/mcp.smoke.test.js` - Tests the full MCP server protocol
  - Server initialization and tool listing
  - All 4 MCP tools with valid inputs
  - Error handling with invalid inputs
  - Relative vs absolute path handling

## Running Tests

### Prerequisites

```bash
npm install
npm run build  # Required for MCP tests that use dist/index.js
```

### Test Commands

```bash
# Run all tests
npm test

# Run tests in watch mode (re-runs on file changes)
npm run test:watch

# Run with coverage (experimental Node.js feature)
npm run test:coverage

# Run specific test file
node --test tests/analyzer.test.js
node --test tests/mcp.smoke.test.js
```

## Test Data

Tests use the components in `examples/sample-components/`:

- `App.tsx` - Main app with Button and Card usage
- `Button.tsx` - Component with ButtonProps interface and destructured props
- `Card.tsx` - Component with CardProps interface
- `SelectExample.tsx` - Select component with missing width examples

## Expected Test Behavior

### Positive Test Cases

- ✅ Find Button component with props: children, onClick, disabled, variant, className, ...rest
- ✅ Find Card component with props: title, children, className, footer
- ✅ Find Select component with props: options, value, onChange, width
- ✅ Detect TypeScript interfaces: ButtonProps, CardProps, SelectProps
- ✅ Find onClick usage in Button definitions and JSX elements
- ✅ Find Select components missing width prop
- ✅ Detect spread operators (...rest, ...spread)

### Negative Test Cases

- ❌ Non-existent components return empty results
- ❌ Non-existent props return empty results
- ❌ Invalid paths throw appropriate errors
- ❌ Components with spread props are not flagged as missing required props

### MCP Protocol Tests

- ✅ Server initializes and responds to protocol handshake
- ✅ Lists 4 available tools with correct schemas
- ✅ All tools accept valid inputs and return structured responses
- ✅ Tools handle invalid inputs gracefully with error responses
- ✅ Server doesn't crash on malformed requests

## Test Coverage

The test suite covers:

- All 4 analyzer methods: analyzeProps, findPropUsage, getComponentProps, findComponentsWithoutProp
- All 4 MCP tools with the same names
- TypeScript interface detection
- Spread operator handling in both component definitions and JSX usage
- Error conditions and edge cases
- Path resolution (relative/absolute)

## CI/CD Integration

Tests are designed to run in any Node.js 18+ environment:

- No external dependencies beyond npm packages
- Uses built-in Node.js test runner (no additional test framework)
- Self-contained test data in examples/ directory
- Deterministic assertions that don't depend on file system specifics

## Debugging Tests

To debug failing tests:

1. Run individual test files: `node --test tests/analyzer.test.js`
2. Add console.log statements in test files to inspect actual vs expected data
3. Check that examples/ directory contains expected components
4. Verify build output exists in dist/ for MCP tests

## Adding New Tests

When adding new features:

1. Add corresponding example components to `examples/sample-components/`
2. Add positive tests to verify the feature works
3. Add negative tests to verify edge cases
4. Add MCP integration tests if new tools are added
5. Update this documentation with new test expectations
