# Legacy JSX prop analysis

These features apply to the four legacy MCP tools selected with `--legacy-tools` and to the `JSXPropAnalyzer` API. `analyze_jsx_props` accepts optional `baselinePath` alongside `path`, `componentName`, `propName`, and `includeTypes`. Both paths obey configured filesystem restrictions.

## Forwarding evidence and baseline comparisons

Component definitions returned by `get_component_props` and `analyze_jsx_props` can include `forwardedProps`. For example, `({label, ...rest}) => <UI.Button {...rest} />` reports source `rest`, target `UI.Button`, and excluded prop `label`, with the spread's source location. Identifier parameters (`<Button {...props} />`), body destructuring, renamed rest bindings, and chained rest destructuring are supported. Unused rest bindings are not reported as forwarding. Shadowed or reassigned bindings are not mistaken for the original props. A dynamic computed destructuring key sets `hasDynamicExclusions: true`; its runtime name is unknown.

Forwarding is syntactic evidence, not proof that the target consumes a prop. Target names are not resolved across imports; aliases, arbitrary helper calls, object mutations, and conditional runtime behavior are not evaluated. Follow the reported targets when reviewing a wrapper chain. Do not interpret `...rest` alone as either a dropped prop or proof of support. Quoted/static keys are reported by their public names; dynamic keys are not invented as named props.

To separate changed evidence from pre-existing behavior, point `baselinePath` at a separate checkout of the base revision with the same relative file layout:

```json
{
  "path": "/workspace/current/src",
  "baselinePath": "/workspace/base/src"
}
```

The optional `comparison` includes `addedPropUsages`, `removedPropUsages`, `addedComponents`, `removedComponents`, and `changedComponents` (before/after definitions). Matching uses relative files, component/prop names, readable values, duplicate counts, and forwarding evidence rather than line numbers or absolute checkout paths. Unchanged evidence is omitted from the comparison, but the normal analysis still describes the current tree. Component/prop/type filters apply to both trees; filtering can therefore hide unrelated changes. Renamed/moved files appear as removals and additions.

This is a comparison of static evidence, not a dropped-prop validator or an automatic regression verdict. In particular, changed callers and changed definitions still need to be reviewed together. Previously broken behavior must not be attributed to a migration merely because it appears in the current analysis. The server reads an existing baseline directory; it does not invoke git, switch branches, or create worktrees. For legacy MCP clients, start the stdio server with `--legacy-tools` and pass `baselinePath` in the tool request, not as a CLI flag. The query/inspect/check CLI commands and default MCP tools use the newer project-aware interfaces.
