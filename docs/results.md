# Predictable analysis results

The shared result helpers in `src/results.ts` give search, inspection, and audit
tools a common response shape. This layer does not read files or change existing
MCP tools; subsequent tool PRs consume it.

```ts
import { paginateResults, sourceSnippet } from 'jsx-prop-lookup-mcp-server/dist/results.js';

const page = paginateResults(
  [{ filePath: 'src/Widget.tsx', line: 2, column: 1, snippet: sourceSnippet(source, 2) }],
  { offset: 0, limit: 100 },
  [{ filePath: 'src/Dynamic.tsx', reason: 'Dynamic component cannot be resolved' }]
);
```

`paginateResults(items, options?, unresolved?)` returns:

| Field        | Meaning                                                                                                                |
| ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `matches`    | The requested page, sorted by path, line, then column. Extra fields on each match are preserved.                       |
| `total`      | Total matching locations before pagination.                                                                            |
| `offset`     | Zero-based position of the page, default `0`.                                                                          |
| `limit`      | Requested page size, default `100`, maximum `500`.                                                                     |
| `nextOffset` | Offset for the next page, or `null` at the end.                                                                        |
| `unresolved` | All unresolved cases, independently of the requested page. Each has a path and reason, and may have a line and column. |
| `complete`   | `false` when any unresolved case exists. A response with more pages can still be complete.                             |

Limits must be integers from `1` to `500`, and offsets must be non-negative
integers. Invalid values throw `RangeError`; they are not silently clamped.
An offset equal to or beyond `total` returns an empty page and `nextOffset: null`.

Sorting compares paths case-sensitively with backslashes treated as slashes,
then compares line and column numerically. Original paths and match objects are
retained. Identical locations retain input order. Neither the input match array
nor the unresolved array is mutated; unresolved cases retain their input order.

`sourceSnippet(source, line)` takes a one-based line number. It returns the whole
line, including indentation but excluding LF or CRLF line endings. A missing or
non-integer line returns an empty string. Snippets longer than 240 Unicode code
points become the first 239 code points plus `…`; the ellipsis is inside the cap.
This counts Unicode code points, not grapheme clusters or bytes.
