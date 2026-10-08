# Inspect component definitions

`inspect_component` returns component definitions, their declared props and types,
JSDoc descriptions and deprecations, and defaults that can be read statically.
It works for exported components even when the project has no JSX callers.

```json
{
  "component": "Widget",
  "source": "./components",
  "path": ".",
  "limit": 100,
  "offset": 0
}
```

Names can be the declaration name, a local import alias, or the original export.
Imports and barrel exports resolve to the same definition. A `source` filter
selects that module's components; without one, multiple same-named definitions
are all returned. Relative paths use the configured project root and its access
restrictions. Results use the shared sorted pagination and source snippets.

Props come from a function's first parameter annotation, an explicit `React.FC`
or `FunctionComponent` type argument, or a `Component`/`PureComponent` class type
argument. Types declared later in the file and imported types are supported.
Generic substitutions and intersections use the compiler's resolved prop type.
Source annotations are retained when an unresolved type or the no-library
compiler environment would otherwise erase them.
Missing type dependencies and unresolved generics inside object, callback, or
array props keep the page incomplete. Recursive types are inspected without
revisiting the same type. When function overloads have an implementation, its
props signature is used; multiple ambient declarations without an implementation
are reported as ambiguous.
`required` describes the declaration's optional marker; defaults are reported
separately. For example, `title: string` stays required even if a destructured
parameter supplies a default.

Literal destructuring defaults and `defaultProps` properties have
`{ "status": "known", "value": ... }`. A default such as `computeTitle()` has
`{ "status": "unknown", "expression": "computeTitle()" }` and an unresolved
diagnostic. Application code is never executed. Destructuring defaults take
precedence over a corresponding `defaultProps` value. Conditional or nested
`defaultProps` assignments remain unresolved. Each whole-object assignment
replaces earlier defaults, including class static defaults. Literal object
spreads follow property order: an unknown spread makes preceding defaults
unknown, and later explicit values can restore known defaults. Known keys inside
nested literal spreads are retained through parentheses, type assertions,
`satisfies`, and nonnull assertions. Assignments from other modules remain
unresolved because their execution order is unknown. Spreads of non-object
values, computed accessors, and prototype setters remain explicitly unresolved;
prototype setters do not produce an own prop named `__proto__`.

Every result page has `unresolved` and `complete`. Unknown prop types, dynamic
defaults, and unsupported wrappers such as `memo(forwardRef(...))` make the page
incomplete. Union props require selecting a variant and are reported as unresolved
instead of presenting their shared fields as a complete props list.
A missing component also produces an explicit unresolved case. A
resolved component with no declared parameters can have an empty props list and
still be complete.
