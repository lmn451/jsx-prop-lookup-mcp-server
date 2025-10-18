// Babel bindings - we'll use the TS analyzer directly
type parseOptions
type astProgram
type babelNode
type babelPath
type visitor

@module("@babel/types")
external isJSXIdentifier: Js.t<'a> => bool = "isJSXIdentifier"

@module("@babel/types")
external isJSXAttribute: Js.t<'a> => bool = "isJSXAttribute"

@module("@babel/types")
external isJSXSpreadAttribute: Js.t<'a> => bool = "isJSXSpreadAttribute"

@module("@babel/types")
external isJSXElement: Js.t<'a> => bool = "isJSXElement"
