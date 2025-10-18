// MCP Server related types for ReScript implementation

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

type toolSchema = {
  type_: string,
  properties: Js.Dict.t<Js.Dict.t<string>>,
  required: array<string>
}

type toolDefinition = {
  name: string,
  title: string,
  description: string,
  inputSchema: toolSchema
}

type toolHandler = Js.Json.t => promise<Js.Json.t>

type serverConfig = {
  name: string,
  version: string
}

// MCP Tool Input/Output types
type analyzePropsInput = {
  path: string,
  componentName: option<string>,
  propName: option<string>,
  includeTypes: option<bool>
}

type findPropUsageInput = {
  propName: string,
  path: string,
  componentName: option<string>
}

type getComponentPropsInput = {
  componentName: string,
  path: string
}

type findComponentsWithoutPropInput = {
  componentName: string,
  requiredProp: string,
  path: string,
  assumeSpreadHasRequiredProp: option<bool>
}

// Error types for MCP operations
type mcpError =
  | ToolExecutionError(string)
  | InvalidInputError(string)
  | ServerConnectionError(string)