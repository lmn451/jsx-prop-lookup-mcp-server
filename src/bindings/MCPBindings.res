// MCP SDK bindings for ReScript
// These bindings allow ReScript to use the Model Context Protocol SDK

type toolResultContent = {
  type_: string,
  text: string
}

type toolResult = {
  content: array<toolResultContent>
}

type mcpServer
type mcpTool
type stdioTransport

type toolInputSchema

type toolDefinition = {
  description: string,
  inputSchema: toolInputSchema
}

type serverConfig = {
  name: string,
  version: string
}

// Tool handler type that accepts JSON and returns result
type toolHandler = Js.Json.t => promise<toolResult>

// MCP SDK external bindings
@module("@modelcontextprotocol/sdk/server/mcp.js")
external createMCPServer: serverConfig => mcpServer = "McpServer"

@module("@modelcontextprotocol/sdk/server/stdio.js")
external createStdioTransport: unit => stdioTransport = "StdioServerTransport"

// MCP Server methods
@send
external registerTool: (
  mcpServer,
  string,
  toolDefinition,
  toolHandler
) => unit = "registerTool"

@send
external connect: (
  mcpServer,
  stdioTransport
) => Js.Promise.t<unit> = "connect"

// Utility functions for MCP operations
let createServer = (name: string, version: string): mcpServer => {
  createMCPServer({
    name: name,
    version: version
  })
}

let createTransport = (): stdioTransport => {
  createStdioTransport()
}

// Zod schema bindings for input validation
type zodSchema

@module("zod")
external zString: unit => zodSchema = "string"

@module("zod")
external zBoolean: unit => zodSchema = "boolean"

@module("zod")
external zNumber: unit => zodSchema = "number"

@module("zod")
external zObject: Js.Dict.t<zodSchema> => zodSchema = "object"

@module("zod")
external zOptional: zodSchema => zodSchema = "optional"

@module("zod")
external zDefault: (zodSchema, 'a) => zodSchema = "default"

// Schema building utilities
let createStringSchema = (): zodSchema => zString()
let createBooleanSchema = (): zodSchema => zBoolean()
let createNumberSchema = (): zodSchema => zNumber()

let createOptionalSchema = (schema: zodSchema): zodSchema => zOptional(schema)
let createDefaultSchema = (schema: zodSchema, defaultValue: 'a): zodSchema => zDefault(schema, defaultValue)