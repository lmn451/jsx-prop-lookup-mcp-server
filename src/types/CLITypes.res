// CLI related types for ReScript implementation

type outputFormat =
  | JSON
  | Pretty
  | Minimal

type cliCommand =
  | AnalyzeProps
  | FindPropUsage
  | GetComponentProps
  | FindComponentsWithoutProp

type cliArgs = {
  command: cliCommand,
  path: option<string>,
  componentName: option<string>,
  propName: option<string>,
  requiredProp: option<string>,
  includeTypes: option<bool>,
  assumeSpreadHasRequiredProp: option<bool>,
  help: option<bool>
}

type cliConfig = {
  supportedCommands: array<string>,
  defaultPath: string,
  outputFormat: outputFormat
}

// CLI Error types
type cliError =
  | UnknownCommandError(string)
  | MissingRequiredArgError(string)
  | InvalidPathError(string)
  | ExecutionError(string)

// Exit codes for CLI
type exitCode =
  | Success(int) // 0
  | Error(int)   // 1
  | InvalidArgs(int) // 2