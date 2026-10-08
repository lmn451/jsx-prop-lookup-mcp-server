# Test Coverage Summary

## Purpose

The test suite covers the observable behavior of the JSX analyzer and its MCP stdio boundary. This summary intentionally avoids a fixed test count or pass-status claim because those values become stale as the suite changes.

## MCP server coverage

The stdio integration coverage exercises:

- server initialization;
- discovery of exactly the six current tools;
- calls to `analyze_jsx_props`;
- calls to `find_prop_usage`;
- calls to `get_component_props`;
- calls to `find_components_without_prop`;
- calls to `find_jsx`;
- calls to `check_jsx`;
- relative path handling;
- missing-argument validation; and
- tool error responses without server termination.

Additional boundary coverage verifies all four default search paths, invalid argument types, optional type metadata, concurrent requests, and successful analysis after repairing a parse failure on the same connection.

The protocol-facing coverage is maintained for the official `@modelcontextprotocol/server` v2 implementation and the `2026-07-28` protocol/specification line. MCP v1-only package APIs and protocol assumptions are outside the current target.

## Filesystem security coverage

Allowed-root coverage exercises:

- access to targets within `ALLOWED_ROOTS`;
- rejection of targets outside configured roots; and
- rejection of symlinks whose existing targets resolve outside a configured root.

The runtime also supports equivalent configuration through `--allowed-roots`.

Tests exercise both CLI option forms, precedence over environment configuration, multiple and relative roots, sibling-prefix and parent-traversal rejection, directory-scan symlinks, and literal glob characters in directory names.

## Analyzer coverage

Analyzer tests cover:

- JavaScript, JSX, TypeScript, and TSX parsing;
- component and prop discovery;
- TypeScript interface detection;
- destructured and identifier-based prop access;
- prop usage filtering by component;
- component instances missing a required prop;
- spread attributes;
- common and complex JSX attribute values;
- error handling for invalid inputs; and
- namespaced JSX identifiers such as `UI.Select` and deeper member expressions.

Namespaced component matching accepts either a full dotted name or the local name and retains the full name in results where applicable.

Regression tests assert exact fragment counts, JSX children, scoped and computed prop access, defaulted parameters, trailing type declarations, empty directories, ignored build/dependency paths, and renamed destructuring with source locations.

## CLI and optional logger coverage

The CLI tests execute help and invalid-argument paths, signal-driven shutdown, and stdin EOF. The disconnected request logger is tested with injected fetch behavior, including timeout cancellation, rejected responses, one-time warnings, duration normalization, and configuration opt-out. No telemetry endpoint is contacted by the suite.

## Regression focus

The suite retains coverage for Babel traversal and value extraction, including expression shapes that previously caused traversal or serialization failures. Coverage includes the six supported tools; removed or experimental query and similarity tools are not part of the product contract.
