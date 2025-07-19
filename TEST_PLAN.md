# JSX Prop Lookup MCP Server - Test Plan

## Overview
Comprehensive test plan for validating all functionality of the JSX Prop Lookup MCP Server across different scenarios, file structures, and edge cases.

## Test Environment Setup

### Prerequisites
- Node.js 18+
- npm/npx available
- Git repository access
- Various React/TypeScript test files

### Test Data Structure
```
test-data/
├── simple-components/
│   ├── Button.tsx
│   ├── Input.jsx
│   └── Card.js
├── complex-components/
│   ├── Form.tsx
│   ├── DataTable.tsx
│   └── Modal.jsx
├── edge-cases/
│   ├── EmptyComponent.tsx
│   ├── NoProps.jsx
│   ├── OnlySpread.tsx
│   └── Contents.js/  (directory named like file)
├── typescript-interfaces/
│   ├── PropsWithInterface.tsx
│   └── GenericProps.tsx
└── problematic-files/
    ├── SyntaxError.jsx
    ├── InvalidJSX.tsx
    └── BinaryFile.png
```

## Test Categories

## 1. Core Functionality Tests

### 1.1 Tool: `analyze_jsx_props`

#### Test Case 1.1.1: Basic Component Analysis
**Objective**: Verify basic prop analysis works correctly
**Input**: 
```typescript
// Button.tsx
interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary';
}

const Button: React.FC<ButtonProps> = ({ children, onClick, variant = 'primary' }) => {
  return <button onClick={onClick} className={`btn-${variant}`}>{children}</button>;
};
```
**Expected Output**:
- Component found: "Button"
- Props found: children, onClick, variant
- TypeScript interface detected: "ButtonProps"
- Prop usages in JSX element tracked

#### Test Case 1.1.2: Directory Analysis
**Objective**: Analyze entire directory structure
**Input**: `./test-data/simple-components`
**Expected Output**:
- Multiple components analyzed
- Summary statistics accurate
- All supported file types processed (.js, .jsx, .ts, .tsx)

#### Test Case 1.1.3: Filtered Analysis
**Objective**: Filter by specific component or prop
**Input**: 
- componentName: "Button"
- propName: "onClick"
**Expected Output**:
- Only Button components returned
- Only onClick prop usages shown

### 1.2 Tool: `find_prop_usage`

#### Test Case 1.2.1: Specific Prop Search
**Objective**: Find all usages of a specific prop
**Input**: propName: "onClick"
**Expected Output**:
- All onClick prop usages across all files
- Accurate file locations and line numbers
- Prop values extracted where possible

#### Test Case 1.2.2: Component-Specific Prop Search
**Objective**: Find prop usage limited to specific component
**Input**: 
- propName: "className"
- componentName: "Button"
**Expected Output**:
- Only className usages in Button components
- Other components' className usage excluded

### 1.3 Tool: `get_component_props`

#### Test Case 1.3.1: Component Props Extraction
**Objective**: Extract all props for a specific component
**Input**: componentName: "Select"
**Expected Output**:
- All props used in Select component definitions
- TypeScript interface information if available
- Spread operators detected

### 1.4 Tool: `find_components_without_prop`

#### Test Case 1.4.1: Missing Required Props
**Objective**: Find components missing required props
**Input**: 
- componentName: "Select"
- requiredProp: "width"
**Expected Output**:
- List of Select components without width prop
- Existing props shown for each instance
- Accurate statistics (count, percentage)

#### Test Case 1.4.2: Spread Operator Handling
**Objective**: Verify spread operators are handled correctly
**Input**: Component with `{...props}` spread
**Expected Output**:
- Components with spread operators not flagged as missing props
- Spread operators noted in existing props

## 2. File System Handling Tests

### 2.1 EISDIR Error Prevention

#### Test Case 2.1.1: Directory Named Like File
**Objective**: Handle directories named like files (e.g., Contents.js/)
**Input**: Directory structure with `Contents.js/` folder
**Expected Output**:
- No EISDIR errors thrown
- Directory skipped with warning
- Analysis continues for other files

#### Test Case 2.1.2: Complex Directory Structure
**Objective**: Handle nested directories and symlinks
**Input**: Complex nested structure with various file types
**Expected Output**:
- Only valid JS/JSX/TS/TSX files processed
- Directories and other files skipped gracefully
- No crashes or errors

### 2.2 File Type Handling

#### Test Case 2.2.1: Supported File Extensions
**Objective**: Verify all supported extensions work
**Input**: Files with .js, .jsx, .ts, .tsx extensions
**Expected Output**:
- All files processed correctly
- Appropriate parsing for each file type

#### Test Case 2.2.2: Unsupported File Types
**Objective**: Handle unsupported files gracefully
**Input**: .png, .css, .json files in directory
**Expected Output**:
- Unsupported files skipped
- No errors thrown
- Only JS/JSX/TS/TSX files analyzed

## 3. Error Handling Tests

### 3.1 Syntax Errors

#### Test Case 3.1.1: Invalid JavaScript
**Objective**: Handle files with syntax errors
**Input**: File with invalid JavaScript syntax
**Expected Output**:
- Error logged but analysis continues
- Other files still processed
- Graceful error messages

#### Test Case 3.1.2: Invalid JSX
**Objective**: Handle malformed JSX
**Input**: File with unclosed JSX tags
**Expected Output**:
- Parse error handled gracefully
- Analysis continues for other files

### 3.2 Permission Errors

#### Test Case 3.2.1: Unreadable Files
**Objective**: Handle permission denied errors
**Input**: Files with restricted read permissions
**Expected Output**:
- Permission errors handled gracefully
- Warning logged
- Analysis continues

## 4. Performance Tests

### 4.1 Large Codebase

#### Test Case 4.1.1: Many Files
**Objective**: Test performance with large number of files
**Input**: 100+ React component files
**Expected Output**:
- Analysis completes in reasonable time
- Memory usage remains stable
- Accurate results for all files

#### Test Case 4.1.2: Large Files
**Objective**: Handle very large component files
**Input**: Files with 1000+ lines of code
**Expected Output**:
- Large files processed correctly
- No memory issues
- Accurate prop extraction

## 5. MCP Protocol Tests

### 5.1 Server Startup

#### Test Case 5.1.1: Server Initialization
**Objective**: Verify MCP server starts correctly
**Input**: `npx jsx-prop-lookup-mcp-server`
**Expected Output**:
- Server starts without errors
- Proper MCP protocol response
- All tools available

#### Test Case 5.1.2: Tool Discovery
**Objective**: Verify MCP client can discover tools
**Input**: MCP tools/list request
**Expected Output**:
- All 4 tools listed
- Correct tool descriptions
- Proper input schemas

### 5.2 Tool Execution

#### Test Case 5.2.1: Tool Parameter Validation
**Objective**: Verify required parameters are enforced
**Input**: Tool calls with missing required parameters
**Expected Output**:
- Appropriate error messages
- Tool execution fails gracefully

#### Test Case 5.2.2: Tool Response Format
**Objective**: Verify tool responses are properly formatted
**Input**: Valid tool calls
**Expected Output**:
- JSON responses properly formatted
- All expected fields present
- Data types correct

## 6. Integration Tests

### 6.1 Real-World Scenarios

#### Test Case 6.1.1: React App Analysis
**Objective**: Analyze a real React application
**Input**: Actual React project directory
**Expected Output**:
- Comprehensive analysis results
- All components and props found
- Performance acceptable

#### Test Case 6.1.2: TypeScript Project
**Objective**: Analyze TypeScript React project
**Input**: TypeScript React project with interfaces
**Expected Output**:
- TypeScript interfaces detected
- Generic props handled correctly
- Type information preserved

## 7. Edge Cases

### 7.1 Empty and Minimal Cases

#### Test Case 7.1.1: Empty Directory
**Objective**: Handle empty directories
**Input**: Empty directory
**Expected Output**:
- No errors thrown
- Empty results returned
- Proper summary statistics (0 files, 0 components)

#### Test Case 7.1.2: No JSX Files
**Objective**: Handle directories with no JSX files
**Input**: Directory with only .css, .json files
**Expected Output**:
- No components found
- No errors thrown
- Appropriate summary

### 7.2 Complex JSX Patterns

#### Test Case 7.2.1: Nested Components
**Objective**: Handle deeply nested JSX structures
**Input**: Components with complex nesting
**Expected Output**:
- All prop usages tracked correctly
- Nested component props distinguished

#### Test Case 7.2.2: Dynamic Props
**Objective**: Handle computed prop names and values
**Input**: Props with expressions, computed values
**Expected Output**:
- Dynamic props detected
- Values extracted where possible

## Test Execution

### Automated Test Script
```bash
#!/bin/bash
# run-tests.sh

echo "🧪 Running JSX Prop Lookup MCP Server Test Suite"

# Setup test data
npm run setup-test-data

# Core functionality tests
npm run test:core

# File system tests  
npm run test:filesystem

# Error handling tests
npm run test:errors

# Performance tests
npm run test:performance

# MCP protocol tests
npm run test:mcp

# Integration tests
npm run test:integration

# Edge case tests
npm run test:edge-cases

echo "✅ Test suite completed"
```

### Manual Testing Checklist

- [ ] Server starts without errors
- [ ] All 4 tools respond correctly
- [ ] EISDIR errors resolved
- [ ] Large codebases handled
- [ ] TypeScript interfaces detected
- [ ] Spread operators handled correctly
- [ ] Missing props detection accurate
- [ ] Error messages helpful
- [ ] Performance acceptable
- [ ] Documentation matches behavior

## Success Criteria

### Functional Requirements
- ✅ All 4 tools work correctly
- ✅ No EISDIR errors occur
- ✅ TypeScript support complete
- ✅ Accurate prop detection
- ✅ Proper error handling

### Performance Requirements
- ✅ Analyze 100+ files in <30 seconds
- ✅ Handle files up to 10MB
- ✅ Memory usage <500MB for large projects

### Reliability Requirements
- ✅ No crashes on malformed files
- ✅ Graceful error recovery
- ✅ Consistent results across runs

## Test Data Maintenance

### Test Data Updates
- Add new React patterns as they emerge
- Include real-world component examples
- Update TypeScript interface patterns
- Add edge cases discovered in production

### Regression Testing
- Run full test suite before each release
- Verify fixes don't break existing functionality
- Test with multiple Node.js versions
- Validate MCP protocol compatibility