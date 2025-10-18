open AnalyzerTypes

let validateAbsolutePath = (rawPath: Js.Json.t, paramName: string): result<string, string> => {
  try {
    let path = switch Js.Json.classify(rawPath) {
    | Js.Json.JSONString(s) => s
    | _ => raise(Js.Exn.raiseError("Invalid type for " ++ paramName))
    }

    let trimmed = Js.String.trim(path)
    if Js.String.length(trimmed) === 0 {
      Error("Invalid argument: " ++ paramName ++ " must be a non-empty string")
    } else if !BunBindings.isAbsolute(trimmed) {
      Error(
        "Relative or non-absolute paths are not allowed. Provide an absolute path for " ++
        paramName
      )
    } else {
      Ok(trimmed)
    }
  } catch {
  | _ =>
    Error("Invalid argument: " ++ paramName ++ " must be a string")
  }
}

// Helper to extract string fields from JSON object
let getStringField = (obj: Js.Json.t, key: string): option<string> => {
  switch Js.Json.get(obj, key) {
  | None => None
  | Some(json) =>
    switch Js.Json.classify(json) {
    | Js.Json.JSONString(s) => Some(s)
    | _ => None
    }
  }
}

// Helper to extract boolean fields from JSON object
let getBoolField = (obj: Js.Json.t, key: string): option<bool> => {
  switch Js.Json.get(obj, key) {
  | None => None
  | Some(json) =>
    switch Js.Json.classify(json) {
    | Js.Json.JSONTrue => Some(true)
    | Js.Json.JSONFalse => Some(false)
    | _ => None
    }
  }
}

// Convert prop usage to JSON
let propUsageToJson = (usage: propUsage): Js.Json.t => {
  let json = Js.Dict.empty()
  Js.Dict.set(json, "propName", Js.Json.string(usage.propName))
  Js.Dict.set(json, "componentName", Js.Json.string(usage.componentName))
  Js.Dict.set(json, "line", Js.Json.number(Int.toFloat(usage.line)))
  Js.Dict.set(json, "column", Js.Json.number(Int.toFloat(usage.column)))
  switch usage.value {
  | Some(v) => Js.Dict.set(json, "value", Js.Json.string(v))
  | None => ()
  }
  switch usage.isSpread {
  | Some(b) => Js.Dict.set(json, "isSpread", Js.Json.boolean(b))
  | None => ()
  }
  Js.Json.object_(json)
}

// Convert component analysis to JSON
let componentAnalysisToJson = (comp: componentAnalysis): Js.Json.t => {
  let json = Js.Dict.empty()
  Js.Dict.set(json, "componentName", Js.Json.string(comp.componentName))
  Js.Dict.set(json, "file", Js.Json.string(comp.file))
  Js.Dict.set(json, "props", Js.Json.array(Js.Array.map(propUsageToJson, comp.props)))
  switch comp.propsInterface {
  | Some(pi) => Js.Dict.set(json, "propsInterface", Js.Json.string(pi))
  | None => ()
  }
  Js.Json.object_(json)
}

// Convert analysis result to JSON
let analysisResultToJson = (result: analysisResult): Js.Json.t => {
  let json = Js.Dict.empty()

  let summaryJson = Js.Dict.empty()
  Js.Dict.set(summaryJson, "totalFiles", Js.Json.number(Int.toFloat(result.summary.totalFiles)))
  Js.Dict.set(
    summaryJson,
    "totalComponents",
    Js.Json.number(Int.toFloat(result.summary.totalComponents))
  )
  Js.Dict.set(summaryJson, "totalProps", Js.Json.number(Int.toFloat(result.summary.totalProps)))
  Js.Dict.set(json, "summary", Js.Json.object_(summaryJson))

  Js.Dict.set(json, "components", Js.Json.array(Js.Array.map(componentAnalysisToJson, result.components)))

  let propUsagesJson = Js.Dict.empty()
  Js.Dict.entries(result.propUsages)->Js.Array.forEach(((file, usages)) => {
    Js.Dict.set(propUsagesJson, file, Js.Json.array(Js.Array.map(propUsageToJson, usages)))
  })
  Js.Dict.set(json, "propUsages", Js.Json.object_(propUsagesJson))

  Js.Json.object_(json)
}

// Convert missing prop result to JSON
let missingPropResultToJson = (result: missingPropResult): Js.Json.t => {
  let json = Js.Dict.empty()

  let summaryJson = Js.Dict.empty()
  Js.Dict.set(summaryJson, "totalInstances", Js.Json.number(Int.toFloat(result.summary.totalInstances)))
  Js.Dict.set(summaryJson, "missingPropCount", Js.Json.number(Int.toFloat(result.summary.missingPropCount)))
  Js.Dict.set(
    summaryJson,
    "missingPropPercentage",
    Js.Json.number(result.summary.missingPropPercentage)
  )
  Js.Dict.set(json, "summary", Js.Json.object_(summaryJson))

  let usagesJson = Js.Dict.empty()
  Js.Dict.entries(result.missingPropUsages)->Js.Array.forEach(((file, instances)) => {
    let instancesJson = Js.Array.map(instance => {
      let iJson = Js.Dict.empty()
      Js.Dict.set(iJson, "componentName", Js.Json.string(instance.componentName))
      Js.Dict.set(iJson, "file", Js.Json.string(instance.file))
      Js.Dict.set(iJson, "line", Js.Json.number(Int.toFloat(instance.line)))
      Js.Dict.set(iJson, "column", Js.Json.number(Int.toFloat(instance.column)))
      Js.Dict.set(
        iJson,
        "existingProps",
        Js.Json.array(Js.Array.map(Js.Json.string, instance.existingProps))
      )
      Js.Json.object_(iJson)
    }, instances)
    Js.Dict.set(usagesJson, file, Js.Json.array(instancesJson))
  })
  Js.Dict.set(json, "missingPropUsages", Js.Json.object_(usagesJson))

  Js.Json.object_(json)
}

// Create tool result
let createToolResult = (text: string): MCPBindings.toolResult => {
  {
    content: [{
      type_: "text",
      text,
    }],
  }
}

// Register analyze_jsx_props tool
let registerAnalyzeProps = (server: MCPBindings.mcpServer): unit => {
  let toolDef: MCPBindings.toolDefinition = {
    description: "Analyze JSX prop usage in files or directories",
    inputSchema: Obj.magic({
      "type": "object",
      "properties": {
        "path": {
          "type": "string",
          "description": "Absolute path to file or directory to analyze. Relative paths are not allowed.",
        },
        "componentName": {
          "type": "string",
          "description": "Specific component name to analyze",
        },
        "propName": {
          "type": "string",
          "description": "Optional: specific prop name to search for",
        },
        "includeTypes": {
          "type": "boolean",
          "description": "Include TypeScript type information",
        },
      },
      "required": ["path"],
    }),
  }

  let handler = (input: Js.Json.t): promise<MCPBindings.toolResult> => {
    Js.Promise.make((~resolve, ~reject) => {
      let pathJson = Js.Json.get(input, "path")
      switch pathJson {
      | None => reject(. "path is required")
      | Some(pathValue) =>
        let path = validateAbsolutePath(pathValue, "path")
        switch path {
        | Error(e) => reject(. e)
        | Ok(validPath) =>
          let componentName = getStringField(input, "componentName")
          let propName = getStringField(input, "propName")
          let includeTypes = getBoolField(input, "includeTypes")->Belt.Option.getWithDefault(true)

          let promise = JSXAnalyzer.analyzeProps(validPath, componentName, propName, includeTypes)
          let _ = Js.Promise.then_(result => {
            switch result {
            | Error(e) => resolve(. createToolResult("Error: " ++ e))
            | Ok(analysisResult) =>
              let resultJson = analysisResultToJson(analysisResult)
              let text = Js.Json.stringify(resultJson)
              resolve(. createToolResult(text))
            }
            Js.Promise.resolve()
          }, promise)
          let _ = Js.Promise.catch(e => {
            let message = switch e {
            | Js.Exn.Error(e) => Js.Exn.message(e)->Belt.Option.getWithDefault("Unknown error")
            | _ => "Unknown error"
            }
            reject(. message)
            Js.Promise.resolve()
          }, promise)
          ()
        }
      }
    })
  }

  MCPBindings.registerTool(server, "analyze_jsx_props", toolDef, handler)
}

// Register find_prop_usage tool
let registerFindPropUsage = (server: MCPBindings.mcpServer): unit => {
  let toolDef: MCPBindings.toolDefinition = {
    description: "Find all usages of a specific prop across JSX files",
    inputSchema: Obj.magic({
      "type": "object",
      "properties": {
        "propName": {
          "type": "string",
          "description": "Name of the prop to search for",
        },
        "path": {
          "type": "string",
          "description": "Absolute path to directory to search in. Relative paths are not allowed.",
        },
        "componentName": {
          "type": "string",
          "description": "Optional: limit search to specific component",
        },
      },
      "required": ["propName", "path"],
    }),
  }

  let handler = (input: Js.Json.t): promise<MCPBindings.toolResult> => {
    Js.Promise.make((~resolve, ~reject) => {
      let propName = getStringField(input, "propName")
      let pathJson = Js.Json.get(input, "path")

      switch (propName, pathJson) {
      | (None, _) => reject(. "propName is required")
      | (_, None) => reject(. "path is required")
      | (Some(pn), Some(pathValue)) =>
        let path = validateAbsolutePath(pathValue, "path")
        switch path {
        | Error(e) => reject(. e)
        | Ok(validPath) =>
          let componentName = getStringField(input, "componentName")
          let promise = JSXAnalyzer.findPropUsage(pn, validPath, componentName)
          let _ = Js.Promise.then_(result => {
            switch result {
            | Error(e) => resolve(. createToolResult("Error: " ++ e))
            | Ok(analysisResult) =>
              let resultJson = analysisResultToJson(analysisResult)
              let text = Js.Json.stringify(resultJson)
              resolve(. createToolResult(text))
            }
            Js.Promise.resolve()
          }, promise)
          ()
        }
      }
    })
  }

  MCPBindings.registerTool(server, "find_prop_usage", toolDef, handler)
}

// Register get_component_props tool
let registerGetComponentProps = (server: MCPBindings.mcpServer): unit => {
  let toolDef: MCPBindings.toolDefinition = {
    description: "Get all props used by a specific component",
    inputSchema: Obj.magic({
      "type": "object",
      "properties": {
        "componentName": {
          "type": "string",
          "description": "Name of the component to analyze",
        },
        "path": {
          "type": "string",
          "description": "Absolute path to directory to search in. Relative paths are not allowed.",
        },
      },
      "required": ["componentName", "path"],
    }),
  }

  let handler = (input: Js.Json.t): promise<MCPBindings.toolResult> => {
    Js.Promise.make((~resolve, ~reject) => {
      let componentName = getStringField(input, "componentName")
      let pathJson = Js.Json.get(input, "path")

      switch (componentName, pathJson) {
      | (None, _) => reject(. "componentName is required")
      | (_, None) => reject(. "path is required")
      | (Some(cn), Some(pathValue)) =>
        let path = validateAbsolutePath(pathValue, "path")
        switch path {
        | Error(e) => reject(. e)
        | Ok(validPath) =>
          let promise = JSXAnalyzer.getComponentProps(cn, validPath)
          let _ = Js.Promise.then_(result => {
            switch result {
            | Error(e) => resolve(. createToolResult("Error: " ++ e))
            | Ok(componentsByFile) =>
              let resultJson = Js.Dict.empty()
              Js.Dict.entries(componentsByFile)->Js.Array.forEach(((file, comps)) => {
                Js.Dict.set(
                  resultJson,
                  file,
                  Js.Json.array(Js.Array.map(componentAnalysisToJson, comps))
                )
              })
              let text = Js.Json.stringify(Js.Json.object_(resultJson))
              resolve(. createToolResult(text))
            }
            Js.Promise.resolve()
          }, promise)
          ()
        }
      }
    })
  }

  MCPBindings.registerTool(server, "get_component_props", toolDef, handler)
}

// Register find_components_without_prop tool
let registerFindComponentsWithoutProp = (server: MCPBindings.mcpServer): unit => {
  let toolDef: MCPBindings.toolDefinition = {
    description: "Find component instances that are missing a required prop",
    inputSchema: Obj.magic({
      "type": "object",
      "properties": {
        "componentName": {
          "type": "string",
          "description": "Name of the component to check",
        },
        "requiredProp": {
          "type": "string",
          "description": "Name of the required prop",
        },
        "path": {
          "type": "string",
          "description": "Absolute path to directory to search in. Relative paths are not allowed.",
        },
        "assumeSpreadHasRequiredProp": {
          "type": "boolean",
          "description": "If true, any JSX spread attribute is assumed to provide the required prop.",
        },
      },
      "required": ["componentName", "requiredProp", "path"],
    }),
  }

  let handler = (input: Js.Json.t): promise<MCPBindings.toolResult> => {
    Js.Promise.make((~resolve, ~reject) => {
      let componentName = getStringField(input, "componentName")
      let requiredProp = getStringField(input, "requiredProp")
      let pathJson = Js.Json.get(input, "path")
      let assumeSpreadHasRequiredProp =
        getBoolField(input, "assumeSpreadHasRequiredProp")->Belt.Option.getWithDefault(true)

      switch (componentName, requiredProp, pathJson) {
      | (None, _, _) => reject(. "componentName is required")
      | (_, None, _) => reject(. "requiredProp is required")
      | (_, _, None) => reject(. "path is required")
      | (Some(cn), Some(rp), Some(pathValue)) =>
        let path = validateAbsolutePath(pathValue, "path")
        switch path {
        | Error(e) => reject(. e)
        | Ok(validPath) =>
          let promise = JSXAnalyzer.findComponentsWithoutProp(cn, rp, validPath, assumeSpreadHasRequiredProp)
          let _ = Js.Promise.then_(result => {
            switch result {
            | Error(e) => resolve(. createToolResult("Error: " ++ e))
            | Ok(missingPropResult) =>
              let resultJson = missingPropResultToJson(missingPropResult)
              let text = Js.Json.stringify(resultJson)
              resolve(. createToolResult(text))
            }
            Js.Promise.resolve()
          }, promise)
          ()
        }
      }
    })
  }

  MCPBindings.registerTool(server, "find_components_without_prop", toolDef, handler)
}

// Start the server
let start = (server: MCPBindings.mcpServer): promise<unit> => {
  Js.Promise.make((~resolve, ~reject) => {
    try {
      registerAnalyzeProps(server)
      registerFindPropUsage(server)
      registerGetComponentProps(server)
      registerFindComponentsWithoutProp(server)

      let transport = MCPBindings.createStdioTransport()
      let promise = MCPBindings.connect(server, transport)
      let _ = Js.Promise.then_(_ => {
        Js.Console.error("JSX Prop Lookup MCP Server running on stdio")
        resolve(.)
        Js.Promise.resolve()
      }, promise)
      let _ = Js.Promise.catch(e => {
        let message = switch e {
        | Js.Exn.Error(e) => Js.Exn.message(e)->Belt.Option.getWithDefault("Unknown error")
        | _ => "Unknown error"
        }
        Js.Console.error("Failed to start MCP server: " ++ message)
        reject(. message)
        Js.Promise.resolve()
      }, promise)
      ()
    } catch {
    | Js.Exn.Error(e) =>
      let message = Js.Exn.message(e)->Belt.Option.getWithDefault("Unknown error")
      reject(. message)
    | _ =>
      reject(. "Unknown error starting server")
    }
  })
}
