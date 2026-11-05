# Audit JSX props

`check_jsx` checks undeclared props with `undeclared: true`, or runs explicit rules against every selected JSX call site. It uses the
same project root, discovery rules, and import identity as `find_jsx`.

```json
{
  "path": ".",
  "rules": [
    {
      "id": "button-migration",
      "component": "Button",
      "source": "./Button",
      "required": ["label"],
      "deprecated": ["variant"],
      "forbidden": ["unsafe"]
    }
  ],
  "offset": 0,
  "limit": 100
}
```

A rule must name a component and at least one prop check. `source` restricts
matches to an import source or securely resolved definition. Aliased imports
match their original export. Rule IDs default to `rule-1`, `rule-2`, and so on;
IDs must be unique, including generated IDs. IDs, component names, and prop names
are trimmed. Unknown rule fields, empty names, and an empty rule list are errors.
Repeated prop names within one check produce one finding per call site.

Each finding has an `elementId` (`filePath:line:column`, shared by findings on the same element), file, one-based line and column, snippet, rule ID, component,
prop, message, and kind (`missing`, `deprecated`, or `forbidden`). A prop is
present when explicitly supplied or known from an inline literal spread.
Boolean shorthand and a false value both count as supplied. A dynamic value
does not make an explicitly supplied prop absent. JSX children count as a prop;
comments alone do not.

An unknown spread may provide an otherwise absent prop. That case is reported
in `unresolved`, rather than asserted as a missing prop or a passing forbidden
check. Explicit props still prove presence even when another spread can change
their value. Unresolved imported definitions and parse failures also make the
analysis incomplete. Analysis never evaluates application code.

The response uses the shared sorted result page (default 100, maximum 500), plus
`summary` containing `findings`, `unresolved`, and `status`:

| Status       | Meaning                                                        |
| ------------ | -------------------------------------------------------------- |
| `pass`       | Complete analysis with no findings                             |
| `fail`       | Complete analysis with at least one finding                    |
| `incomplete` | At least one unresolved case, with any known findings retained |

All callers are checked before pagination. An empty page past the last finding
does not turn a failure into a pass. Unresolved cases remain in every page.

The shared library function is `checkJsx(project, query)` from
`dist/check-jsx.js`; `validateRules(value)` exposes the same rule validation.
Saved rule files are described in [saved checks](saved-checks.md); CLI exit
statuses are documented in the [CLI reference](cli.md).

## Built-in undeclared-prop audit

Call `check_jsx({"undeclared": true})` or run `check --undeclared --json`. No rule file is needed. Combine `undeclared: true` with `rules` (CLI: `--rules FILE`) to run both audits.

The audit reads component call/construct signatures, inferred destructured props, imported aliases, and renamed barrel exports. Root `jsconfig.json` path aliases are honored when no `tsconfig.json` exists. Typed styled factories and React wrappers use their resolved callable contracts; no wrapper code is executed. Intrinsic DOM elements are not audited, and React's reserved `key` is ignored. A declared string index signature accepts arbitrary prop names. Union and overload contracts accept names from any alternative; this is a name audit, not a replacement for TypeScript's value/variant checking.

Findings have `kind: "undeclared"`, `ruleId: "undeclared-props"`, and an optional `suggestion` for an unambiguous camelCase/kebab-case/underscore spelling match (for example `data-testid` to `dataTestId`). Suggestions are read-only. IDs identify a source location, not an element across edits that move it.

Direct untyped destructured rest forwarded to a DOM element is tolerated; unused rest produces findings with `forwarding: "discarded"`. Typed components still obey their declared contract. Rest forwarded to another component or used in an unproven way stays unresolved rather than being labeled dropped. The analysis does not prove conditional runtime consumption or follow arbitrary helpers. Unknown contracts, missing type dependencies, and unknown spreads on closed contracts keep the audit incomplete.

Use `summaryOnly: true` or `fields: ["elementId", "component", "prop", "suggestion"]` to reduce output; see [result controls](results.md#compact-output).
