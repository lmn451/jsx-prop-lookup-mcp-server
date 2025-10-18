// CLI entry point for JSX analyzer

// Parse command line arguments
let parseArgs = (): (string, Js.Dict.t<string>) => {
  let args = Node.Process.argv->Js.Array.sliceFrom(2)
  let command = if Js.Array.length(args) > 0 {
    Js.Array.unsafe_get(args, 0)
  } else {
    ""
  }

  let namedArgs: Js.Dict.t<string> = Js.Dict.empty()
  let i = ref(1)
  while i.contents < Js.Array.length(args) {
    let key = Js.Array.unsafe_get(args, i.contents)
    let keyWithoutDashes = Js.String.replaceByRe(%re("/^--/"), "", key)
    let value = if i.contents + 1 < Js.Array.length(args) {
      Js.Array.unsafe_get(args, i.contents + 1)
    } else {
      ""
    }
    if !Js.String.startsWith("--", value) {
      Js.Dict.set(namedArgs, keyWithoutDashes, value)
      i.contents = i.contents + 2
    } else {
      i.contents = i.contents + 1
    }
  }

  (command, namedArgs)
}

// Print JSON result to stdout
let printResult = (result: Js.Json.t): unit => {
  let json = Js.Json.stringify(result)
  Js.Console.log(json)
}

// Print error message
let printError = (message: string): unit => {
  Js.Console.error("Error: " ++ message)
}

// Get absolute path from argument or use current directory
let getTargetPath = (namedArgs: Js.Dict.t<string>): string => {
  switch Js.Dict.get(namedArgs, "path") {
  | Some(path) => BunBindings.resolve([path])
  | None => BunBindings.resolve([Node.Process.cwd()])
  }
}

// Convert analysis result to JSON
let analysisResultToJson = (result: AnalyzerTypes.analysisResult): Js.Json.t => {
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

  let componentToJson = (comp: AnalyzerTypes.componentAnalysis): Js.Json.t => {
    let cJson = Js.Dict.empty()
    Js.Dict.set(cJson, "componentName", Js.Json.string(comp.componentName))
    Js.Dict.set(cJson, "file", Js.Json.string(comp.file))

    let propsJson = Js.Array.map(usage => {
      let pJson = Js.Dict.empty()
      Js.Dict.set(pJson, "propName", Js.Json.string(usage.propName))
      Js.Dict.set(pJson, "componentName", Js.Json.string(usage.componentName))
      Js.Dict.set(pJson, "line", Js.Json.number(Int.toFloat(usage.line)))
      Js.Dict.set(pJson, "column", Js.Json.number(Int.toFloat(usage.column)))
      switch usage.value {
      | Some(v) => Js.Dict.set(pJson, "value", Js.Json.string(v))
      | None => ()
      }
      Js.Json.object_(pJson)
    }, comp.props)
    Js.Dict.set(cJson, "props", Js.Json.array(propsJson))

    switch comp.propsInterface {
    | Some(pi) => Js.Dict.set(cJson, "propsInterface", Js.Json.string(pi))
    | None => ()
    }

    Js.Json.object_(cJson)
  }

  Js.Dict.set(
    json,
    "components",
    Js.Json.array(Js.Array.map(componentToJson, result.components))
  )

  let propUsagesJson = Js.Dict.empty()
  Js.Dict.entries(result.propUsages)->Js.Array.forEach(((file, usages)) => {
    let usagesJsonArray = Js.Array.map(usage => {
      let uJson = Js.Dict.empty()
      Js.Dict.set(uJson, "propName", Js.Json.string(usage.propName))
      Js.Dict.set(uJson, "componentName", Js.Json.string(usage.componentName))
      Js.Dict.set(uJson, "line", Js.Json.number(Int.toFloat(usage.line)))
      Js.Dict.set(uJson, "column", Js.Json.number(Int.toFloat(usage.column)))
      switch usage.value {
      | Some(v) => Js.Dict.set(uJson, "value", Js.Json.string(v))
      | None => ()
      }
      switch usage.isSpread {
      | Some(b) => Js.Dict.set(uJson, "isSpread", Js.Json.boolean(b))
      | None => ()
      }
      Js.Json.object_(uJson)
    }, usages)
    Js.Dict.set(propUsagesJson, file, Js.Json.array(usagesJsonArray))
  })
  Js.Dict.set(json, "propUsages", Js.Json.object_(propUsagesJson))

  Js.Json.object_(json)
}

// Convert missing prop result to JSON
let missingPropResultToJson = (result: AnalyzerTypes.missingPropResult): Js.Json.t => {
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
      let propsArray = Js.Array.map(Js.Json.string, instance.existingProps)
      Js.Dict.set(iJson, "existingProps", Js.Json.array(propsArray))
      Js.Json.object_(iJson)
    }, instances)
    Js.Dict.set(usagesJson, file, Js.Json.array(instancesJson))
  })
  Js.Dict.set(json, "missingPropUsages", Js.Json.object_(usagesJson))

  Js.Json.object_(json)
}

// Convert component group result to JSON
let componentGroupToJson = (groups: AnalyzerTypes.componentGroupsByFile): Js.Json.t => {
  let json = Js.Dict.empty()

  Js.Dict.entries(groups)->Js.Array.forEach(((file, comps)) => {
    let compsJson = Js.Array.map(comp => {
      let cJson = Js.Dict.empty()
      Js.Dict.set(cJson, "componentName", Js.Json.string(comp.componentName))
      Js.Dict.set(cJson, "file", Js.Json.string(comp.file))

      let propsJson = Js.Array.map(usage => {
        let pJson = Js.Dict.empty()
        Js.Dict.set(pJson, "propName", Js.Json.string(usage.propName))
        Js.Dict.set(pJson, "componentName", Js.Json.string(usage.componentName))
        Js.Dict.set(pJson, "line", Js.Json.number(Int.toFloat(usage.line)))
        Js.Dict.set(pJson, "column", Js.Json.number(Int.toFloat(usage.column)))
        switch usage.value {
        | Some(v) => Js.Dict.set(pJson, "value", Js.Json.string(v))
        | None => ()
        }
        Js.Json.object_(pJson)
      }, comp.props)
      Js.Dict.set(cJson, "props", Js.Json.array(propsJson))

      switch comp.propsInterface {
      | Some(pi) => Js.Dict.set(cJson, "propsInterface", Js.Json.string(pi))
      | None => ()
      }

      Js.Json.object_(cJson)
    }, comps)
    Js.Dict.set(json, file, Js.Json.array(compsJson))
  })

  Js.Json.object_(json)
}

// Main CLI handler
let main = (): unit => {
  let (command, namedArgs) = parseArgs()

  if command === "" {
    printError("Usage: jsx-analyzer <command> [options]")
    printError("Commands: analyze_jsx_props, find_prop_usage, get_component_props, find_components_without_prop")
    Node.Process.exit(1)
  }

  let targetPath = getTargetPath(namedArgs)

  switch command {
  | "analyze_jsx_props" =>
    let componentName = Js.Dict.get(namedArgs, "componentName")
    let propName = Js.Dict.get(namedArgs, "propName")
    let includeTypes = switch Js.Dict.get(namedArgs, "includeTypes") {
    | Some("false") => false
    | _ => true
    }

    let promise = JSXAnalyzer.analyzeProps(targetPath, componentName, propName, includeTypes)
    let _ = Js.Promise.then_(result => {
      switch result {
      | Error(e) =>
        printError(e)
        Node.Process.exit(1)
      | Ok(analysisResult) =>
        let json = analysisResultToJson(analysisResult)
        printResult(json)
      }
      Js.Promise.resolve()
    }, promise)
    ()

  | "find_prop_usage" =>
    let propName = Js.Dict.get(namedArgs, "propName")
    let componentName = Js.Dict.get(namedArgs, "componentName")

    switch propName {
    | None =>
      printError("--propName is required")
      Node.Process.exit(1)
    | Some(pn) =>
      let promise = JSXAnalyzer.findPropUsage(pn, targetPath, componentName)
      let _ = Js.Promise.then_(result => {
        switch result {
        | Error(e) =>
          printError(e)
          Node.Process.exit(1)
        | Ok(analysisResult) =>
          let json = analysisResultToJson(analysisResult)
          printResult(json)
        }
        Js.Promise.resolve()
      }, promise)
      ()
    }

  | "get_component_props" =>
    let componentName = Js.Dict.get(namedArgs, "componentName")

    switch componentName {
    | None =>
      printError("--componentName is required")
      Node.Process.exit(1)
    | Some(cn) =>
      let promise = JSXAnalyzer.getComponentProps(cn, targetPath)
      let _ = Js.Promise.then_(result => {
        switch result {
        | Error(e) =>
          printError(e)
          Node.Process.exit(1)
        | Ok(groups) =>
          let json = componentGroupToJson(groups)
          printResult(json)
        }
        Js.Promise.resolve()
      }, promise)
      ()
    }

  | "find_components_without_prop" =>
    let componentName = Js.Dict.get(namedArgs, "componentName")
    let requiredProp = Js.Dict.get(namedArgs, "requiredProp")
    let assumeSpreadHasRequiredProp = switch Js.Dict.get(namedArgs, "assumeSpreadHasRequiredProp") {
    | Some("false") => false
    | _ => true
    }

    switch (componentName, requiredProp) {
    | (None, _) =>
      printError("--componentName is required")
      Node.Process.exit(1)
    | (_, None) =>
      printError("--requiredProp is required")
      Node.Process.exit(1)
    | (Some(cn), Some(rp)) =>
      let promise = JSXAnalyzer.findComponentsWithoutProp(cn, rp, targetPath, assumeSpreadHasRequiredProp)
      let _ = Js.Promise.then_(result => {
        switch result {
        | Error(e) =>
          printError(e)
          Node.Process.exit(1)
        | Ok(missingPropResult) =>
          let json = missingPropResultToJson(missingPropResult)
          printResult(json)
        }
        Js.Promise.resolve()
      }, promise)
      ()
    }

  | _ =>
    printError("Unknown command: " ++ command)
    Node.Process.exit(1)
  }
}

let () = main()
