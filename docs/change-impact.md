# Preview prop removal

Prop-removal analysis reports JSX callers affected by a proposed component prop
removal. It never edits source files or evaluates application code. The inspect
surface exposes this analysis through `inspect_component`'s optional `removeProp`
argument and the CLI's `inspect --remove-prop <name>` option; it adds no MCP tool.

The shared library entry point is:

```ts
import { analyzePropRemoval } from './change-impact.js';

const impact = await analyzePropRemoval(project, {
  component: 'Button',
  source: './ui', // Optional import source or local module, relative to each caller.
  prop: 'label',
  path: 'src', // Optional project file or directory; defaults to the whole project.
  offset: 0,
  limit: 100,
});
```

Component and prop names are trimmed and must be nonempty. Component and source
matching follow `find_jsx`: local aliases, namespace/default imports, and simple
barrels retain their import identity. Same-name imports from another source and
shadowed bindings do not inherit the selected component's identity. A declaration
lookup is not required to inspect callers.

An explicit prop, a prop from a static literal spread, or JSX children proves an
affected usage. False, null, and dynamic values all count as present. A later
unknown spread can make a value unknown without removing the proof of presence.
An unknown spread with no proven queried prop produces an unresolved case instead
of an invented affected usage. Comment-only children and inherited object keys do
not supply props. Unresolved imports, parse errors, and unreadable discovered
files also preserve explicit uncertainty.

Each affected match includes `filePath`, one-based `line` and `column`, `snippet`,
the local `component` name, import `identity`, the proposed `prop`, and its known
or unknown `value`. Results use the shared sorted page with `matches`, `total`,
`offset`, `limit`, `nextOffset`, `unresolved`, and `complete`. The default page size
is 100; accepted limits are integers from 1 through 500. Offsets are nonnegative
integers.

The `summary` contains `action: "remove-prop"`, normalized `component` and `prop`,
the total `affected` count, and the `unresolved` count. Every selected JSX caller
is analyzed before pagination, so the summary includes callers past the first
page. An empty page beyond the end does not erase affected callers. Incomplete
analysis retains known affected usages and keeps `complete` false.

Each run reads a fresh source snapshot, including imported component modules.
Edits between calls are reflected in the next result. Project-root boundaries
apply to discovery, source reads, and TypeScript dependency resolution.
