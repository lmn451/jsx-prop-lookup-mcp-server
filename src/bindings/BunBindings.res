// Node.js runtime bindings for file system and utilities
// These bindings work with Bun's Node.js compatibility layer

type fileStat = {
  isFile: unit => bool,
  isDirectory: unit => bool,
  size: float
}

type globOptions = {
  ignore: array<string>,
  nodir: bool
}

// File system operations using Node.js fs module
@module("node:fs")
external readFileSync: (string, string) => string = "readFileSync"

@module("node:fs")
external writeFileSync: (string, string) => unit = "writeFileSync"

@module("node:fs")
external statSync: string => fileStat = "statSync"

@module("node:fs")
external readdirSync: string => array<string> = "readdirSync"

@module("node:fs")
external existsSync: string => bool = "existsSync"

// Glob pattern matching using a simple implementation
// glob bindings will be added once native implementation is needed

// Path manipulation utilities using Node.js path module
@module("node:path")
external join: array<string> => string = "join"

@module("node:path")
external resolve: array<string> => string = "resolve"

@module("node:path")
external extname: string => string = "extname"

@module("node:path")
external basename: string => string = "basename"

@module("node:path")
external isAbsolute: string => bool = "isAbsolute"

// Glob pattern matching
@module("glob")
external glob: (string, globOptions) => Js.Promise.t<array<string>> = "glob"

// Async glob helper
let globAsync = (pattern: string, ignorePatterns: array<string>): Js.Promise.t<array<string>> => {
  glob(pattern, {
    ignore: ignorePatterns,
    nodir: true
  })
}

// Console and process utilities using Node.js
let consoleLog = (message: 'a): unit => {
  Js.Console.log(message)
}

let consoleError = (message: 'a): unit => {
  Js.Console.error(message)
}

@module("node:process")
external processExit: int => unit = "exit"

// Environment and process info using Node.js
@module("node:process")
external processVersion: string = "version"

@module("node:process")
external processPlatform: string = "platform"

@module("node:process")
external env: Js.Dict.t<string> = "env"

// Utility functions for common operations
let isSupportedFileExtension = (filename: string): bool => {
  let ext = extname(filename)
  ext === ".js" || ext === ".jsx" || ext === ".ts" || ext === ".tsx"
}

let isFile = (path: string): bool => {
  try {
    let stats = statSync(path)
    stats.isFile()
  } catch {
    | _ => false
  }
}

let isDirectory = (path: string): bool => {
  try {
    let stats = statSync(path)
    stats.isDirectory()
  } catch {
    | _ => false
  }
}

let fileExists = (path: string): bool => {
  existsSync(path)
}

let readdir = (path: string): array<string> => readdirSync(path)

let readFile = (path: string): result<string, string> => {
  try {
    Ok(readFileSync(path, "utf-8"))
  } catch {
    | exn =>
      let message =
        switch exn {
        | Js.Exn.Error(e) => Js.Exn.message(e)->Belt.Option.getWithDefault("Unknown error")
        | _ => "Unknown error"
        }
      Error(message)
  }
}