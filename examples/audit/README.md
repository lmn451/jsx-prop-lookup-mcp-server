# Button migration and audit examples

For a source checkout, run `npm ci && npm run build` from the repository root first.
For an installed npm package, run the commands from that package's directory and
skip those setup steps: npm has installed its runtime dependencies, and `dist/`
is included.

The commands analyze this fixture without executing its components or changing
its source. `Missing.tsx` intentionally omits a required prop; `Dynamic.tsx`
intentionally spreads an object whose keys cannot be determined statically.

## Find callers before a migration

```sh
node dist/index.js query --project-root examples/audit --component Button --source ./Button --json
```

The four callers use the local alias `Action`. The result contains their
locations and snippets in `Dynamic.tsx`, `Good.tsx`, `Legacy.tsx`, and
`Missing.tsx`. The dynamic spread is reported as unresolved, so this query is
incomplete rather than evidence that every prop value is known.

## Read a component's contract

```sh
node dist/index.js inspect --project-root examples/audit --component Button --json
```

The definition is in `src/Button.tsx`. `label` is required, `variant` is optional
and deprecated, and `disabled` is optional with the static default `false`.
Documentation comes from the declaration's comments.

## Run the same checks locally and in CI

```sh
node dist/index.js check --project-root examples/audit --path src/Good.tsx --rules rules.json --json
node dist/index.js check --project-root examples/audit --path src/Legacy.tsx --rules rules.json --json
node dist/index.js check --project-root examples/audit --path src/Dynamic.tsx --rules rules.json --json
```

| Input         | Expected result                                  | Exit status |
| ------------- | ------------------------------------------------ | ----------- |
| `Good.tsx`    | No findings or unresolved cases                  | `0`         |
| `Legacy.tsx`  | One deprecated `variant` finding                 | `1`         |
| `Dynamic.tsx` | Unknown spread could supply `label` or `variant` | `2`         |

To audit the entire fixture, omit `--path`. Expect two findings: deprecated
`variant` in `Legacy.tsx` and missing `label` in `Missing.tsx`. The unresolved
spread in `Dynamic.tsx` makes the overall exit status `2`, even though the known
findings are also returned. An incomplete analysis must not produce a passing
CI result.

The rule file's source filter excludes unrelated components with the same name.
Remove a finding by updating the caller and rerun the same saved check. The
analysis commands themselves do not rewrite the project.
