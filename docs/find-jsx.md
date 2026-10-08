# Find JSX call sites

`find_jsx` searches JSX elements using import identity. It never runs application code. Existing analysis tools remain available during migration.

```json
{
  "component": "Button",
  "source": "./ui",
  "prop": "title",
  "value": "Save",
  "limit": 100,
  "offset": 0
}
```

`import { Button as B } from './ui'` matches this component/source pair when the JSX tag is `B`; `Button` from another module is excluded. Namespace imports (`UI.Button`), default imports (`component: "default"`), local re-exports, and local tsconfig path aliases are supported. Shadowed bindings retain their lexical identity. Source filters are exact import specifiers or local modules resolved relative to each call site, within the configured project boundary.

Each match includes its local component name, import identity and resolved definition when available, one-based location, source snippet, props, and unknown spreads. Prop values are `{ "status": "known", "value": ... }` for literals and `{ "status": "unknown", "expression": ... }` otherwise. Static object literal spreads and JSX children count as props. No expression, getter, function, or imported application module is executed. JSX text containing ampersands is conservatively unknown because encoded JSX entities require runtime text normalization. Object prototype setter syntax is also unknown; computed own keys remain supported.

`prop` requires a provably present prop. `value` requires `prop`, compares primitive values as strings (`true`, `3`, `null`, or a string's contents), and excludes values that cannot be established statically. Dynamic spreads might contain or override a queried prop; these appear in `unresolved`, and `complete` is false. Literal spread keys remain present even when their values are dynamic, shorthand, getters, or methods. Nested literal spreads are read in source order; unknown spreads and dynamic computed keys can make earlier values unknown without removing proven prop presence. A later explicit property or attribute restores its own known value. Missing component modules and parse errors are also reported rather than silently treated as complete analysis.

Results use the shared sorted pagination contract: `matches`, `total`, `offset`, `limit`, `nextOffset`, `unresolved`, and `complete`. Defaults are offset zero and 100 matches, with a maximum page size of 500. Omit filters to list all discovered JSX call sites.

The exported `createJsxSnapshot` and `collectJsx` APIs let related analysis tools inspect every match before pagination, using the same filesystem and import resolution boundary.
