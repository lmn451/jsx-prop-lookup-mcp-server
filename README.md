# JSX Prop Lookup MCP Server

An MCP (Model Context Protocol) server that analyzes JSX prop usage in React/TypeScript codebases using AST parsing.

## Features

- **AST-based Analysis**: Uses Babel parser for accurate JSX/TSX parsing
- **Prop Usage Tracking**: Find where props are used across components
- **Component Analysis**: Analyze prop definitions and usage patterns
- **Missing Prop Detection**: Find components missing required props (e.g., Select without width)
- **TypeScript Support**: Includes TypeScript interface analysis
- **Robust File Handling**: Handles complex directory structures without EISDIR errors
- **Multiple Search Options**: Search by component, prop name, or analyze entire directories
- **Multiple Response Formats**: Choose from full, compact, or minimal response formats for optimal performance
- **Editor Integration**: Optional prettyPath field for deep-linking to specific files and lines
- **Configurable Output**: Control column inclusion and response verbosity

## Installation

### Option 1: Use with npx (Recommended)
No installation required! Use directly with npx:

```bash
npx jsx-prop-lookup-mcp-server
```

### Option 2: Install Globally
```bash
npm install -g jsx-prop-lookup-mcp-server
jsx-prop-lookup-mcp-server
```

### Option 3: Development Setup
```bash
git clone https://github.com/your-username/jsx-prop-lookup-mcp-server.git
cd jsx-prop-lookup-mcp-server
npm install
npm run build
npm start
```

## Usage

The server provides six main tools:

### 1. `analyze_jsx_props`
Analyze JSX prop usage in files or directories.

**Parameters:**
- `path` (required): File or directory path to analyze
- `componentName` (optional): Specific component name to analyze
- `propName` (optional): Specific prop name to search for
- `includeTypes` (optional): Include TypeScript type information (default: true)
- `format` (optional): Response format - 'full' (default), 'compact', or 'minimal'
- `includeColumns` (optional): Include column numbers in location data (default: true)
- `includePrettyPaths` (optional): Include editor-compatible file paths for deep linking (default: false)

### 2. `find_prop_usage`
Find all usages of a specific prop across JSX files.

**Parameters:**
- `propName` (required): Name of the prop to search for
- `directory` (optional): Directory to search in (default: ".")
- `componentName` (optional): Limit search to specific component
- `format` (optional): Response format - 'full' (default), 'compact', or 'minimal'
- `includeColumns` (optional): Include column numbers in location data (default: true)
- `includePrettyPaths` (optional): Include editor-compatible file paths for deep linking (default: false)

### 3. `get_component_props`
Get all props used by a specific component.

**Parameters:**
- `componentName` (required): Name of the component to analyze
- `directory` (optional): Directory to search in (default: ".")
- `format` (optional): Response format - 'full' (default), 'compact', or 'minimal'
- `includeColumns` (optional): Include column numbers in location data (default: true)
- `includePrettyPaths` (optional): Include editor-compatible file paths for deep linking (default: false)

### 4. `query_components`
**NEW**: Advanced component querying with prop value filtering and complex logic.

**Parameters:**
- `componentName` (required): Name of the component to query
- `propCriteria` (required): Array of prop criteria to match against
- `options` (optional): Configuration object with the following properties:
  - `directory` (optional): Directory to search in (default: ".")
  - `logic` (optional): Logic operator for multiple criteria - 'AND' (default) or 'OR'
  - `format` (optional): Response format - 'full' (default), 'compact', or 'minimal'
  - `includeColumns` (optional): Include column numbers in location data (default: true)
  - `includePrettyPaths` (optional): Include editor-compatible file paths for deep linking (default: false)

**Prop Criteria Format:**
Each criterion in `propCriteria` can have:
- `name` (required): Name of the prop to check
- `value` (optional): Value to match against (used with operator)
- `operator` (optional): 'equals' (default) or 'contains' for value matching
- `exists` (optional): Boolean to check prop existence (true/false)

**Example Use Cases:**
- Find Button components with variant="primary" AND onClick handler
- Find Input components with placeholder containing "email" OR type="email"
- Find components missing required accessibility props
- Complex filtering: components with specific prop combinations

**Examples:**

Find Button components with primary variant:
```json
{
  "componentName": "Button",
  "propCriteria": [
    { "name": "variant", "value": "primary", "operator": "equals" }
  ]
}
```

Find Input components with email-related props (OR logic):
```json
{
  "componentName": "Input", 
  "propCriteria": [
    { "name": "type", "value": "email", "operator": "equals" },
    { "name": "placeholder", "value": "email", "operator": "contains" }
  ],
  "options": { "logic": "OR" }
}
```

Find components with required props (AND logic):
```json
{
  "componentName": "Select",
  "propCriteria": [
    { "name": "options", "exists": true },
    { "name": "onChange", "exists": true },
    { "name": "value", "exists": true }
  ],
  "options": { "logic": "AND" }
}
```

### 5. `find_components_without_prop`
Find component instances that are missing a required prop (e.g., Select components without width prop).

**Parameters:**
- `componentName` (required): Name of the component to check (e.g., "Select")
- `requiredProp` (required): Name of the required prop (e.g., "width")
- `directory` (optional): Directory to search in (default: ".")

**Example Use Cases:**
- Find all Select components without width prop
- Identify Button components missing onClick handlers
- Audit components for required accessibility props
- Ensure consistent prop usage across codebase

## Response Formats

The server supports three response formats to optimize for different use cases:

### Full Format (default)
Complete analysis with all available information. Best for comprehensive analysis and debugging.

### Compact Format
Groups results by file to reduce redundancy. Reduces response size by 20-40% while maintaining most information.

### Minimal Format
Returns only essential prop information grouped by prop name. Reduces response size by 50-60%, ideal for quick lookups.

## Format Comparison Example

Here's how the same `find_prop_usage` request for "onClick" props returns different responses:

### Request
```json
{
  "name": "find_prop_usage",
  "arguments": {
    "propName": "onClick",
    "directory": "./src"
  }
}
```

### Full Format Response (1,247 bytes)
```json
{
  "propUsages": [
    {
      "propName": "onClick",
      "componentName": "Button",
      "file": "./src/Button.tsx",
      "line": 15,
      "column": 20,
      "propValue": "handleClick",
      "propType": "identifier"
    }
  ],
  "components": [...],
  "summary": {
    "totalFiles": 2,
    "totalComponents": 1,
    "totalPropUsages": 2
  }
}
```

### Compact Format Response (892 bytes - 28% smaller)
```json
{
  "files": {
    "./src/Button.tsx": {
      "components": ["Button"],
      "usages": [
        {
          "prop": "onClick",
          "component": "Button", 
          "line": 15,
          "value": "handleClick"
        }
      ]
    }
  },
  "summary": { "files": 2, "usages": 2 }
}
```

### Minimal Format Response (445 bytes - 64% smaller)
```json
{
  "onClick": [
    {
      "component": "Button",
      "file": "./src/Button.tsx", 
      "line": 15,
      "value": "handleClick"
    }
  ],
  "summary": { "props": 1, "usages": 2 }
}
```

*See [RESPONSE_FORMATS.md](./RESPONSE_FORMATS.md) for complete examples and detailed format documentation.*

## Example Output

### Full Format (format: 'full')
```json
{
  "summary": {
    "totalFiles": 5,
    "totalComponents": 3,
    "totalProps": 12
  },
  "components": [
    {
      "componentName": "Button",
      "file": "./src/Button.tsx",
      "props": [
        {
          "propName": "onClick",
          "componentName": "Button",
          "file": "./src/Button.tsx",
          "line": 5,
          "column": 10,
          "prettyPath": "./src/Button.tsx:5:10"
        }
      ],
      "propsInterface": "ButtonProps",
      "prettyPath": "./src/Button.tsx"
    }
  ],
  "propUsages": [
    {
      "propName": "className",
      "componentName": "Button",
      "file": "./src/App.tsx",
      "line": 15,
      "column": 20,
      "value": "btn-primary",
      "prettyPath": "./src/App.tsx:15:20"
    }
  ]
}
```

### Compact Format (format: 'compact')
```json
{
  "summary": { "files": 5, "components": 3, "props": 12 },
  "files": {
    "./src/Button.tsx": {
      "components": [
        {
          "name": "Button",
          "props": ["onClick", "children", "className"],
          "interface": "ButtonProps"
        }
      ],
      "usages": [
        {
          "name": "className",
          "line": 15,
          "value": "btn-primary"
        }
      ],
      "prettyPath": "./src/Button.tsx"
    }
  }
}
```

### Minimal Format (format: 'minimal')
```json
{
  "props": {
    "onClick": [
      {
        "component": "Button",
        "file": "./src/Button.tsx",
        "line": 5,
        "prettyPath": "./src/Button.tsx:5"
      }
    ],
    "className": [
      {
        "component": "Button",
        "file": "./src/App.tsx",
        "line": 15,
        "prettyPath": "./src/App.tsx:15"
      }
    ]
  }
}
```

### Missing Props Analysis
```json
{
  "missingPropUsages": [
    {
      "componentName": "Select",
      "file": "./src/Form.tsx",
      "line": 48,
      "column": 6,
      "existingProps": ["options", "placeholder"]
    }
  ],
  "summary": {
    "totalInstances": 2,
    "missingPropCount": 2,
    "missingPropPercentage": 100
  }
}
```

### Query Components Response
```json
{
  "query": {
    "componentName": "Button",
    "propCriteria": [
      { "name": "variant", "value": "primary", "operator": "equals" },
      { "name": "onClick", "exists": true }
    ],
    "options": { "logic": "AND" }
  },
  "results": [
    {
      "componentName": "Button",
      "file": "./src/App.tsx",
      "line": 25,
      "column": 8,
      "prettyPath": "./src/App.tsx:25:8",
      "matchingProps": {
        "variant": {
          "value": "primary",
          "line": 26,
          "column": 12
        },
        "onClick": {
          "value": "handleSubmit",
          "line": 27,
          "column": 12
        }
      },
      "allProps": {
        "variant": "primary",
        "onClick": "handleSubmit",
        "children": "Submit"
      }
    }
  ],
  "summary": {
    "totalMatches": 1,
    "criteriaMatched": 2,
    "filesScanned": 5
  }
}
```

## Supported File Types

- `.js` - JavaScript
- `.jsx` - JavaScript with JSX
- `.ts` - TypeScript
- `.tsx` - TypeScript with JSX

## MCP Client Configuration

### Using with npx (Recommended)
Add to your MCP client configuration:

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

### Using with global installation
```json
{
  "mcpServers": {
    "jsx-prop-lookup": {
      "command": "jsx-prop-lookup-mcp-server"
    }
  }
}
```

### Using with local development
```json
{
  "mcpServers": {
    "jsx-prop-lookup": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "/path/to/jsx-prop-lookup-mcp-server"
    }
  }
}
```

## Development

```bash
npm run dev  # Run in development mode
npm run build  # Build for production
npm start  # Run built version
```