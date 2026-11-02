# Temporary Smoke Tests

These development-only scripts exercise analyzer behavior without external services. The formal Node test suite in `tests/` is the source of release verification.

## Prerequisites

- Node.js 20 or newer
- `npm install`

## Scripts

### Relative and absolute path resolution

```bash
node tmp_rovodev_test_relative_paths.cjs
```

Checks normalization and validation for existing and missing paths.

### Identifier parameter handling

```bash
node --import=tsx tmp_rovodev_test_phase2.ts
```

Checks prop access through identifier parameters such as `p.onClick` and `buttonProps.disabled`.

### Namespaced JSX and summary statistics

```bash
node --import=tsx tmp_rovodev_test_phase3.ts
```

Checks matching `<UI.Select />` by either `UI.Select` or `Select` and verifies missing-prop percentages.

These scripts are not part of the MCP v2 protocol boundary. Run `npm test` for the supported release test suite.
