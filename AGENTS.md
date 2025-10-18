# Agent Instructions for jsx-prop-lookup-mcp-server

This document provides instructions for AI agents to interact with, understand, and modify this repository.

## 1. Project Overview

This project is a JSX prop analyzer that can be used as a command-line tool (`jsx-analyzer`) or as a server that conforms to the Model Context Protocol (`jsx-prop-lookup-mcp-server`). It uses Babel to parse and analyze JSX/TSX files to understand how props are being used. The project is written in TypeScript and uses `bun` as the package manager and runtime.

**Technologies:**

- **Language:** TypeScript
- **Runtime:** Bun
- **Package Manager:** Bun
- **Core Logic:** Babel (for AST parsing and traversal)
- **Testing:** Vitest
- **Server Protocol:** Model Context Protocol (MCP)

## 2. Repository Structure

Here are the key files and directories:

- **`src/`**: Contains all the source code.
  - **`index.ts`**: The entry point for the MCP server. It registers the available tools and handles communication.
  - **`cli.ts`**: The entry point for the command-line interface (CLI). It parses arguments and calls the analyzer.
  - **`jsx-analyzer.ts`**: The core logic of the project. The `JSXPropAnalyzer` class performs the code analysis.
  - **`__tests__/`**: Contains all the tests.
    - **`fixtures/`**: Sample code files used as input for the tests.
- **`examples/`**: Contains sample React components that can be used for testing and demonstration.
- **`package.json`**: Defines project metadata, dependencies, and scripts.
- **`vitest.config.ts`**: Configuration for the Vitest testing framework.
- **`tsconfig.json`**: TypeScript compiler configuration.
- **`dist/`**: The output directory for the compiled code. **Note:** This directory is not checked into version control.

## 3. Setup and Installation

To set up the project, run the following command to install the dependencies:

```bash
bun install
```

## 4. Available Commands

The following commands are available in `package.json`:

- **`bun run build`**: Compiles the TypeScript code from `src` to JavaScript in `dist`. It also copies the test fixtures to the `dist` directory.
- **`bun run test`**: Runs the test suite using Vitest. This command also triggers a build first because of the `pretest` script.
- **`bun run dev`**: Starts the MCP server in watch mode for development. It will automatically restart the server when you make changes to the source code.
- **`bun run start`**: Starts the MCP server from the compiled code in the `dist` directory.
- **`bun run typecheck`**: Runs the TypeScript compiler to check for type errors without generating any output files.

## 5. Core Functionalities

The tool has two main usages:

### As a Command-Line Tool (`jsx-analyzer`)

You can perform analysis directly from the command line.

**Commands:**

- `analyze_jsx_props`: Analyzes JSX prop usage.
- `find_prop_usage`: Finds all usages of a specific prop.
- `get_component_props`: Gets all props for a specific component.
- `find_components_without_prop`: Finds component instances missing a required prop.

**Example:**

To find all instances of the `Select` component in the `examples` directory that are missing the `width` prop, run:

```bash
bunx jsx-analyzer find_components_without_prop --componentName Select --requiredProp width --path examples/sample-components/SelectExample.tsx
```

### As an MCP Server

The server can be started with `bun run start` or `bun run dev`. An MCP client can then connect to it and call the available tools, which correspond to the CLI commands.

## 6. Testing

- **Framework:** Vitest
- **Test Files:** Located in `src/__tests__` and end with `.test.ts`.
- **Fixtures:** Test fixtures are located in `src/__tests__/fixtures`. These are sample code files used as input for the tests.
- **Running Tests:** To run the tests, use the following command:

  ```bash
  bun test
  ```

This command first builds the project and then runs the tests against the compiled code in the `dist` directory. This ensures that the tests are validating the final, shipped code.
