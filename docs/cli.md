# Command line

The executable supports `query`, `inspect`, `check`, and `serve`. With no command,
it starts the MCP stdio server. Commands use flags rather than positional paths.

```bash
jsx-prop-lookup-mcp-server query --project-root /workspace/app --component Button --json
jsx-prop-lookup-mcp-server inspect --project-root /workspace/app --component Button
jsx-prop-lookup-mcp-server check --project-root /workspace/app --rules checks/props.json --json
jsx-prop-lookup-mcp-server serve --project-root /workspace/app
```

## Shared configuration

| Option                  | Meaning                                                                                                              |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `--project-root PATH`   | Project root; overrides `PROJECT_ROOT`, otherwise uses the working directory.                                        |
| `--tsconfig FILE`       | In-project config path; otherwise uses root `tsconfig.json` when present.                                            |
| `--allowed-roots PATHS` | Comma-separated allowed roots; overrides `ALLOWED_ROOTS`. Relative roots resolve from the process working directory. |
| `--help`, `-h`          | Print help without validating project paths or starting a server.                                                    |
| `--version`             | Print the package version without validating project paths or starting a server.                                     |

All relative query and rules-file paths start at the project root. Absolute paths
must also remain inside it. The project applies nested `.gitignore` rules and
TypeScript source selection; empty source selections are supported. Outside paths,
symlink escapes, and external configuration inheritance are rejected. Allowed roots
add a restriction to the project boundary.

## Commands

| Command   | Required flags     | Optional query flags                                                                      |
| --------- | ------------------ | ----------------------------------------------------------------------------------------- |
| `query`   | None               | `--path`, `--component`, `--source`, `--prop`, `--value`, `--offset`, `--limit`, `--json` |
| `inspect` | `--component NAME` | `--path`, `--source`, `--offset`, `--limit`, `--json`                                     |
| `check`   | `--rules FILE`     | `--path`, `--offset`, `--limit`, `--json`                                                 |
| `serve`   | None               | `--legacy-tools`                                                                          |

`query` uses the same search as MCP `find_jsx`: component names can be local import
aliases or original export names; `--source` filters import identity. `--prop`
requires a statically present prop. `--value` additionally matches its primitive
value converted to a string and requires `--prop`. Unknown information is reported
in `unresolved`; application code is never evaluated.

`inspect` uses MCP `inspect_component`'s analysis of component definitions, prop
types, documentation, and statically known defaults. A missing component produces
an incomplete result. `--source` disambiguates component definitions by module.

`check` reads a strict saved JSON document with `version: 1` and a nonempty `rules`
array, then runs the same audit as `check_jsx`. Rules may require, deprecate, or forbid
props. See [saved checks](saved-checks.md) for the file schema. No source or rules
files are modified. Both are reread on each invocation.

For non-serving commands, `--path` defaults to `.`, `--offset` to `0`, and `--limit`
to `100`. Offset must be a non-negative safe integer; limit must be an integer from
`1` through `500`. Paging applies after the complete audit. Unknown commands,
unknown or command-inappropriate flags, missing required values, and invalid page
values exit with an error. `--json` is not accepted for `serve`.

## Output and exit status

`--json` writes exactly one serialized result to stdout, followed by a newline.
Query and inspect return the same paged result as their MCP tools. Check adds an
`exitCode` field to its page and summary. Human output shows located matches or
findings, declared props for inspection, empty-page messages, and unresolved reasons.

| Outcome                                                          | Exit code |
| ---------------------------------------------------------------- | --------- |
| Complete query or inspection                                     | `0`       |
| Complete check with no findings                                  | `0`       |
| Complete check with findings                                     | `1`       |
| Incomplete analysis, invalid configuration, or invalid arguments | `2`       |

Incomplete analysis takes precedence over known findings. A complete check still
exits `1` when the requested page is empty but its total finding count is positive.
Errors with `--json` are machine-readable on stdout:

```json
{ "error": { "message": "check requires --rules." }, "exitCode": 2 }
```

Human-mode errors go to stderr. MCP serving reserves stdout for protocol messages;
startup and diagnostic logs go to stderr. SIGINT and SIGTERM close the transport.

## Legacy compatibility

`serve --legacy-tools` (or bare `--legacy-tools`) exposes the original
`analyze_jsx_props`, `find_prop_usage`, `get_component_props`, and
`find_components_without_prop` tools. This mode is intended for existing beta
clients. Without a project-root or tsconfig option, it retains the legacy working
directory and allowed-roots behavior; configuring a project enables that boundary.
The normal server exposes exactly `find_jsx`, `inspect_component`, and `check_jsx`.

Programmatically, `createServer()` and `createServer({ root, allowedRoots, tsconfig })`
create the modern server around one shared `ProjectWorkspace`. Pass
`{ legacyTools: true }` for explicit compatibility mode. The existing
`createServer(allowedRootsArray)` form remains legacy-compatible. Importing or
creating a server does not start a transport or attach process listeners.
