# Temporary Smoke Tests

This repo includes a few temporary, dev-only smoke scripts to quickly verify behavior added in Phases 1–3. They are safe to run locally and do not require any external services.

Prerequisites

- Install dependencies: `npm install`
- Node.js 18+ (recommended: Node 20+). For Node < 20.6, prefer using the `tsx` CLI instead of `node --import=tsx`.

Scripts

1. Relative/absolute path resolution
   - Command:
     - `node tmp_rovodev_test_relative_paths.cjs`
   - Verifies the path normalization logic used by the MCP tools (relative -> absolute, validation exists).
   - Expected: `OK` lines for existing paths (e.g., `./src`, `./examples/sample-components`), and an `ERR` line for a non-existent path.

2. Phase 2: Identifier parameter handling
   - Commands (choose one):
     - Node >= 20.6: `node --import=tsx tmp_rovodev_test_phase2.ts`
     - Any Node: `npx tsx tmp_rovodev_test_phase2.ts`
   - Verifies the analyzer detects prop usage when function/arrow component parameters are identifiers (e.g., `p.onClick`, `buttonProps.disabled`).
   - Expected: a summary and several `onClick` usages, including ones from `PropsIdentifierExample.tsx`.

3. Phase 3: Namespaced JSX + summary stats
   - Commands (choose one):
     - Node >= 20.6: `node --import=tsx tmp_rovodev_test_phase3.ts`
     - Any Node: `npx tsx tmp_rovodev_test_phase3.ts`
   - Verifies:
     - Namespaced JSX (e.g., `UI.Select`) matches by either `Select` or `UI.Select`.
     - `findComponentsWithoutProp` computes meaningful percentages using a second pass to count total instances.
   - Expected: Missing summary with non-100% percentages, and a missing `width` entry for `UI.Select` in `NamespacedSelectExample.tsx`.

Notes

- These scripts are temporary helpers and not formal tests. We can replace them with a proper test suite (Vitest or Node’s built-in test runner) as a follow-up.
- The scripts analyze the files in `examples/sample-components/` as part of their checks.
