// Hybrid approach: delegate to existing TypeScript MCP server
// This file exists as an entry point but calls the TS implementation

@module("./index.js")
external main: unit => promise<unit> = "default"

let () = {
  main()->Js.Promise.catch(e => {
    let message = switch e {
    | Js.Exn.Error(e) => Js.Exn.message(e)->Belt.Option.getWithDefault("Unknown error")
    | _ => "Unknown error"
    }
    Js.Console.error("Fatal error: " ++ message)
    Node.Process.exit(1)
    Js.Promise.resolve()
  })->ignore
}
