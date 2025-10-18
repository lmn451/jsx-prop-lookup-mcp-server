# 🚀 **Comprehensive ReScript Migration Plan**

## 📋 **Executive Summary**

### **1.1 Project Structure Migration**

```
├── src/
│   ├── types/                    # ReScript type definitions
│   │   ├── AnalyzerTypes.res
│   │   ├── MCPTypes.res
│   │   └── CLITypes.res
│   ├── core/                     # Core analysis engine
│   │   ├── ASTParser.res
│   │   ├── JSXAnalyzer.res
│   │   └── FileProcessor.res
│   ├── mcp/                      # MCP server implementation
│   │   ├── MCPServer.res
│   │   └── ToolHandlers.res
│   ├── cli/                      # CLI interface
│   │   ├── CLIParser.res
│   │   └── CommandRunner.res
│   ├── bindings/                 # JavaScript interop
│   │   ├── BabelBindings.res
│   │   └── BunBindings.res
│   └── test/                     # Test fixtures and helpers
│       ├── TestUtils.res
│       └── Fixtures.res
├── examples/                     # Migrated examples
├── __tests__/                    # ReScript tests
├── rescript.json                # ReScript configuration
├── package.json                 # Updated for Bun + ReScript
└── README_Rescript.md           # Migration documentation
```

### **1.2 Build System Configuration**

```json
// rescript.json
{
  "name": "jsx-prop-analyzer",
  "version": "4.0.0",
  "sources": {
    "dir": "src",
    "subdirs": true
  },
  "package-specs": {
    "module": "es6",
    "in-source": true
  },
  "bs-dependencies": ["rescript-bun", "@rescript/std"],
  "external-stdlib": "@rescript/std",
  "warnings": {
    "error": "+8+27+32+39+44+45+50+55+60+61+62"
  }
}
```

```json
// package.json
{
  "name": "jsx-prop-analyzer-rescript",
  "version": "4.0.0",
  "packageManager": "bun@1.2.2",
  "type": "module",
  "scripts": {
    "build": "rescript build",
    "build:clean": "rescript clean && rescript build",
    "dev": "rescript build -w",
    "start": "node src/mcp/Index.mjs",
    "cli": "node src/cli/CLI.mjs",
    "test": "rescript build && bun test",
    "typecheck": "rescript build -dry-run"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.20.0",
    "@babel/parser": "^7.28.4",
    "@babel/traverse": "^7.28.4",
    "rescript-bun": "^1.0.0"
  }
}
```

## 🔧 **Phase 2: Core Conversion**

### **2.1 Type System Conversion**

```rescript
// src/types/AnalyzerTypes.res
type propUsage = {
  propName: string,
  componentName: string,
  line: int,
  column: int,
  value: option<string>,
  isSpread: option<bool>,
  type_: option<string>
}

type componentAnalysis = {
  componentName: string,
  file: string,
  props: array<propUsage>,
  propsInterface: option<string>
}

type analysisResult = {
  summary: analysisSummary,
  components: array<componentAnalysis>,
  propUsages: propUsagesByFile
}

type analysisSummary = {
  totalFiles: int,
  totalComponents: int,
  totalProps: int
}

type propUsagesByFile = Belt.Map.String.t<array<propUsage>>
```

### **2.2 Core Analyzer Module**

```rescript
// src/core/JSXAnalyzer.res
module JSXAnalyzer = {
  // Pattern matching for AST nodes
  let rec analyzeJSXElement = (element: babelAST.jsxElement): array<propUsage> => {
    switch element {
    | {openingElement: {attributes: []}} => []
    | {openingElement: {attributes}} =>
        attributes->Belt.Array.map(attr => analyzeAttribute(attr))
    }
  }

  and analyzeAttribute = (attr: babelAST.jsxAttribute): propUsage => {
    switch attr {
    | JSXAttribute({name: {name: propName}, value: Some(StringLiteral({value}))}) => {
        propName,
        componentName: "unknown", // Set by caller
        line: attr.loc.start.line,
        column: attr.loc.start.column,
        value: Some(value),
        isSpread: Some(false),
        type_: None
      }
    | JSXSpreadAttribute(_) => {
        propName: "...spread",
        componentName: "unknown",
        line: attr.loc.start.line,
        column: attr.loc.start.column,
        value: None,
        isSpread: Some(true),
        type_: None
      }
    | _ => // Handle other cases
    }
  }
}
```

### **2.3 MCP Server Implementation**

```rescript
// src/mcp/MCPServer.res
module MCPServer = {
  let registerTool = (server: mcpServer, name: string, handler: 'input => promise<'output>) => {
    // ReScript implementation using rescript-bun bindings
    server->MCP.registerTool({
      "name": name,
      "description": `ReScript ${name} tool`,
      "inputSchema": generateSchema(name),
      "handler": handler
    })
  }

  let startServer = async (): unit => {
    let server = MCP.createServer({
      "name": "jsx-prop-lookup-rescript-server",
      "version": "4.0.0"
    })

    // Register all tools
    registerTool(server, "analyze_jsx_props", handleAnalyzeProps)
    registerTool(server, "find_prop_usage", handleFindPropUsage)
    registerTool(server, "get_component_props", handleGetComponentProps)
    registerTool(server, "find_components_without_prop", handleFindComponentsWithoutProp)

    // Start server with Bun's native stdio transport
    await server->MCP.connect(BunStdioTransport.create())
    Console.log("🚀 JSX Prop Analyzer ReScript MCP Server running")
  }
}
```

## 🧪 **Phase 3: Testing & Integration**

### **3.1 Test Framework Migration**

```rescript
// __tests__/JSXAnalyzerTest.res
open Vitest

describe("JSXAnalyzer", () => {
  let analyzer = JSXAnalyzer.create()

  testAsync("analyzes props correctly", async () => {
    let result = await analyzer.analyzeProps("./test/fixtures/Button.res")

    expect(result.components)->Array.length->toBe(1)
    let buttonComponent = result.components[0]
    expect(buttonComponent.componentName)->toBe("Button")
    expect(buttonComponent.props)->Array.length->toBe(3)
  })

  testAsync("finds prop usage across files", async () => {
    let result = await analyzer.findPropUsage("onClick", "./test/fixtures/")

    let totalUsages = result.propUsages
      ->Belt.Map.String.valuesToArray
      ->Array.reduce(0, (acc, arr) => acc + Array.length(arr))

    expect(totalUsages)->toBe(4)
  })
})
```

### **3.2 Dependency Management**

```rescript
// src/bindings/BabelBindings.res
@module("@babel/parser") external parse: (string, parseConfig) => babelAST.program = "parse"
@module("@babel/traverse") external traverse: (babelAST.program, traverseHandlers) => unit = "default"

// Bun-specific bindings
@module("rescript-bun") external readFileSync: (string, string) => string = "readFileSync"
@module("rescript-bun") external statSync: string => bunFileStat = "statSync"
@module("rescript-bun") external glob: (string, globOptions) => promise<array<string>> = "glob"
```

## ⚠️ **Phase 4: Validation & Rollout**

### **4.1 Success Metrics Validation**

| Metric                  | Target               | Measurement           |
| ----------------------- | -------------------- | --------------------- |
| **Compilation Speed**   | < 2 seconds          | `time rescript build` |
| **Runtime Performance** | < 100ms for analysis | Benchmark script      |
| **Type Safety**         | 0 type errors        | `rescript build`      |
| **Test Coverage**       | > 90%                | Test runner output    |
| **Bundle Size**         | < 5MB                | Bundle analyzer       |

### **4.2 Rollback Strategy**

```bash
# Quick rollback to TypeScript version
git tag migration-backup-pre-rescript
git checkout main
git branch -D rescript-migration
npm install  # Restore original dependencies
```

## 📊 **Risk Mitigation Matrix**

| Risk                    | Probability | Impact | Mitigation                                 |
| ----------------------- | ----------- | ------ | ------------------------------------------ |
| **AST Parsing Issues**  | Medium      | High   | Comprehensive test suite + gradual rollout |
| **Babel Integration**   | Low         | High   | Extensive JS interop testing               |
| **MCP Compatibility**   | Low         | Medium | Use existing TypeScript definitions        |
| **Team Learning Curve** | High        | Medium | Pair programming + documentation           |

## 🎯 **Migration Checklist**

### **Pre-Migration**

- [ ] Create backup branch with `git tag pre-rescript-backup`
- [ ] Set up parallel ReScript project structure
- [ ] Install ReScript toolchain and rescript-bun
- [ ] Create initial type definitions

### **During Migration**

- [ ] Convert types first, ensure compilation
- [ ] Implement core analyzer with pattern matching
- [ ] Add comprehensive test coverage
- [ ] Validate MCP server functionality
- [ ] Performance testing and optimization

### **Post-Migration**

- [ ] Full integration testing
- [ ] Documentation updates
- [ ] Team training on ReScript patterns
- [ ] Monitor performance in production

## 💡 **Expected Benefits**

1. **Type Safety**: ReScript's sound type system prevents runtime errors
2. **Performance**: Faster compilation and excellent runtime performance
3. **Maintainability**: Pattern matching makes AST traversal more readable
4. **Developer Experience**: Superior IDE support and error messages
5. **Future-proofing**: Modern language features and active development
