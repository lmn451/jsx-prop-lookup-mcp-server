// Core type definitions for JSX Prop Analyzer in ReScript

// Base types
type propUsage = {
  propName: string,
  componentName: string,
  line: int,
  column: int,
  value: option<string>,
  isSpread: option<bool>,
  type_: option<string>
}

type componentAnalysis = {
  componentName: string,
  file: string,
  props: array<propUsage>,
  propsInterface: option<string>
}

type analysisSummary = {
  totalFiles: int,
  totalComponents: int,
  totalProps: int
}

type propUsagesByFile = Js.Dict.t<array<propUsage>>

type analysisResult = {
  summary: analysisSummary,
  components: array<componentAnalysis>,
  propUsages: propUsagesByFile
}

type componentGroupsByFile = Js.Dict.t<array<componentAnalysis>>

// Location and position types - simplified for ReScript compatibility
type locPosition = {
  line: int,
  column: int
}

type babelLoc = {
  start: locPosition,
  end_: locPosition
}

// Missing prop analysis types
type missingPropInstance = {
  componentName: string,
  file: string,
  line: int,
  column: int,
  existingProps: array<string>
}

type missingPropSummary = {
  totalInstances: int,
  missingPropCount: int,
  missingPropPercentage: float
}

type missingPropResult = {
  missingPropUsages: Js.Dict.t<array<missingPropInstance>>,
  summary: missingPropSummary
}

// JSX attribute types - simplified
type jsxName = {
  name: string,
  loc: babelLoc
}

type jsxAttributeValue =
  | StringLiteral(string)
  | NumericLiteral(float)
  | BooleanLiteral(bool)
  | JSXExpressionContainer(string)
  | NullLiteral(unit)

type jsxAttribute = {
  name: jsxName,
  value: option<jsxAttributeValue>,
  loc: babelLoc
}

type jsxSpreadAttribute = {
  argument: string,
  loc: babelLoc
}

type jsxOpeningElement = {
  name: jsxName,
  attributes: array<jsxAttribute>,
  loc: babelLoc
}

// Recursive type for JSX elements
type rec jsxElement = {
  openingElement: jsxOpeningElement,
  children: array<jsxElement>,
  loc: babelLoc
}

// Configuration types
type analyzerConfig = {
  supportedExtensions: array<string>,
  ignorePatterns: array<string>,
  includeTypes: bool
}

// Error types
type analyzerError =
  | ParseError(string)
  | FileReadError(string)
  | InvalidPathError(string)
  | ASTError(string)

// Result type for operations that can fail
type result<'a, 'b> = Belt.Result.t<'a, 'b>