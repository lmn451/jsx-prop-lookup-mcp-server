# Saved JSX checks

Keep repeatable audits in a JSON file inside the configured project:

```json
{
  "version": 1,
  "rules": [
    {
      "id": "button-props",
      "component": "Button",
      "required": ["label"],
      "deprecated": ["oldVariant"],
      "forbidden": ["unsafe"]
    }
  ]
}
```

The document must contain exactly `version` and `rules`. Version must be `1`,
and rules must be a nonempty array. Each rule accepts only `id`, `component`,
`source`, `required`, `deprecated`, and `forbidden`. A component and at least one
prop check are required. IDs, component names, and prop names are trimmed; empty
names are rejected. `source`, when present, filters the component's import source.
Rule IDs must be unique, including the positional defaults `rule-1`, `rule-2`, and
so on for rules without an ID.

Rules use the same component matching and conservative handling of unresolved
JSX as `checkJsx`. Unknown spreads or unresolved source analysis can make an audit
incomplete even when some violations are already known. No application code is
executed and no source or rule files are edited.

## Programmatic API

```ts
import { ProjectWorkspace } from './project.js';
import {
  ConfigurationError,
  loadSavedChecks,
  runSavedChecks,
  checkExitCode,
} from './saved-checks.js';

const project = new ProjectWorkspace({ root: '/workspace/app' });
const saved = loadSavedChecks(project, 'checks/props.json');
// Synchronous: { version: 1, rules: JsxRule[] }. Names are normalized;
// omitted IDs remain omitted here and are assigned when findings are produced.

const result = await runSavedChecks(project, {
  rulesFile: 'checks/props.json',
  path: 'src', // Optional; defaults to the full project.
  offset: 0, // Optional; defaults to 0.
  limit: 100, // Optional; defaults to 100, valid range 1–500.
});
// checkJsx result plus exitCode: 0 | 1 | 2.
const exitCode = checkExitCode(result);
```

`loadSavedChecks(project, file)` uses the project's secure synchronous reader.
Relative paths start at the project root. Missing files, directories, outside
paths, outside symlink targets, malformed JSON, and schema errors throw an
exported `ConfigurationError` with `name === 'ConfigurationError'`, `exitCode === 2`,
the rules-file path in its message, and the original error in `cause`.

`runSavedChecks(project, { rulesFile, path?, offset?, limit? })` returns a promise
for the full `checkJsx` page and summary, plus `exitCode`. Its result includes
`matches`, `total`, `offset`, `limit`, `nextOffset`, `unresolved`, `complete`, and
`summary: { status, findings, unresolved }`. Saved-file errors reject with
`ConfigurationError`. Analysis and query errors propagate unchanged, allowing a
CLI caller to report them as errors rather than claiming an audit passed.

`checkExitCode({ complete, total })` is synchronous and considers the entire audit:

| Condition                            | Exit code                           |
| ------------------------------------ | ----------------------------------- |
| Complete, no findings                | `0`                                 |
| Complete, one or more findings       | `1`                                 |
| Incomplete, with or without findings | `2`                                 |
| Invalid saved configuration          | `ConfigurationError.exitCode === 2` |

Pagination does not change the exit code: an empty final page with `total > 0`
still exits `1` when complete. Every run rereads both the saved document and source
selection, so edits between runs are reflected in the next result. CLI callers
should map thrown analysis errors to exit `2`; this module does not catch them or
replace them with an empty result. This API adds no MCP tool.
