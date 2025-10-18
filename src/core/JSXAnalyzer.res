open AnalyzerTypes

type analyzer

@module("../jsx-analyzer.js")
@new
external makeAnalyzer: unit => analyzer = "JSXPropAnalyzer"

module Analyzer = {
  @send
  external analyzeProps: (
    analyzer,
    string,
    Js.Nullable.t<string>,
    Js.Nullable.t<string>,
    bool,
  ) => Js.Promise.t<Js.Json.t> = "analyzeProps"

  @send
  external findPropUsage: (
    analyzer,
    string,
    string,
    Js.Nullable.t<string>,
  ) => Js.Promise.t<Js.Json.t> = "findPropUsage"

  @send
  external getComponentProps: (
    analyzer,
    string,
    string,
  ) => Js.Promise.t<Js.Json.t> = "getComponentProps"

  @send
  external findComponentsWithoutProp: (
    analyzer,
    string,
    string,
    string,
    bool,
  ) => Js.Promise.t<Js.Json.t> = "findComponentsWithoutProp"
}

let analyzeProps = (
  path: string,
  componentName: option<string>,
  propName: option<string>,
  includeTypes: bool,
): promise<result<analysisResult, string>> => {
  let analyzer = makeAnalyzer()
  let compName = switch componentName {
  | Some(n) => Js.Nullable.return(n)
  | None => Js.Nullable.null
  }
  let pName = switch propName {
  | Some(n) => Js.Nullable.return(n)
  | None => Js.Nullable.null
  }

  Js.Promise.make((~resolve, ~reject) => {
    Analyzer.analyzeProps(analyzer, path, compName, pName, includeTypes)
    |> Js.Promise.then_(json => {
      try {
        let result = Obj.magic(json)
        resolve(. Ok(result))
      } catch {
      | e =>
        let message = Printexc.to_string(e)
        resolve(. Error(message))
      }
      Js.Promise.resolve()
    })
    |> Js.Promise.catch(e => {
      let message = switch e {
      | Js.Exn.Error(e) => Js.Exn.message(e)->Belt.Option.getWithDefault("Unknown error")
      | _ => "Unknown error"
      }
      reject(. message)
      Js.Promise.resolve()
    })
    |> ignore
  })
}

let findPropUsage = (
  propName: string,
  directory: string,
  componentName: option<string>,
): promise<result<analysisResult, string>> => {
  let analyzer = makeAnalyzer()
  let compName = switch componentName {
  | Some(n) => Js.Nullable.return(n)
  | None => Js.Nullable.null
  }

  Js.Promise.make((~resolve, ~reject) => {
    Analyzer.findPropUsage(analyzer, propName, directory, compName)
    |> Js.Promise.then_(json => {
      try {
        let result = Obj.magic(json)
        resolve(. Ok(result))
      } catch {
      | e =>
        let message = Printexc.to_string(e)
        resolve(. Error(message))
      }
      Js.Promise.resolve()
    })
    |> Js.Promise.catch(e => {
      let message = switch e {
      | Js.Exn.Error(e) => Js.Exn.message(e)->Belt.Option.getWithDefault("Unknown error")
      | _ => "Unknown error"
      }
      reject(. message)
      Js.Promise.resolve()
    })
    |> ignore
  })
}

let getComponentProps = (
  componentName: string,
  directory: string,
): promise<result<componentGroupsByFile, string>> => {
  let analyzer = makeAnalyzer()

  Js.Promise.make((~resolve, ~reject) => {
    Analyzer.getComponentProps(analyzer, componentName, directory)
    |> Js.Promise.then_(json => {
      try {
        let result = Obj.magic(json)
        resolve(. Ok(result))
      } catch {
      | e =>
        let message = Printexc.to_string(e)
        resolve(. Error(message))
      }
      Js.Promise.resolve()
    })
    |> Js.Promise.catch(e => {
      let message = switch e {
      | Js.Exn.Error(e) => Js.Exn.message(e)->Belt.Option.getWithDefault("Unknown error")
      | _ => "Unknown error"
      }
      reject(. message)
      Js.Promise.resolve()
    })
    |> ignore
  })
}

let findComponentsWithoutProp = (
  componentName: string,
  requiredProp: string,
  directory: string,
  assumeSpreadHasRequiredProp: bool,
): promise<result<missingPropResult, string>> => {
  let analyzer = makeAnalyzer()

  Js.Promise.make((~resolve, ~reject) => {
    Analyzer.findComponentsWithoutProp(
      analyzer,
      componentName,
      requiredProp,
      directory,
      assumeSpreadHasRequiredProp,
    )
    |> Js.Promise.then_(json => {
      try {
        let result = Obj.magic(json)
        resolve(. Ok(result))
      } catch {
      | e =>
        let message = Printexc.to_string(e)
        resolve(. Error(message))
      }
      Js.Promise.resolve()
    })
    |> Js.Promise.catch(e => {
      let message = switch e {
      | Js.Exn.Error(e) => Js.Exn.message(e)->Belt.Option.getWithDefault("Unknown error")
      | _ => "Unknown error"
      }
      reject(. message)
      Js.Promise.resolve()
    })
    |> ignore
  })
}
