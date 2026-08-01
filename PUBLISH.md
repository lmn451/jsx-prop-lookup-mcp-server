# Publishing Guide

## Prerequisites

- Node.js 20 or newer
- npm access for the `jsx-prop-lookup-mcp-server` package
- A clean, reviewed release with passing typecheck, lint, build, and test commands

## Release checklist

1. Update the version in `package.json`; run `npm install --package-lock-only` so the lockfile matches.
2. Update the release entry in `CHANGELOG.md`.
3. Verify the package:

   ```bash
   npm ci
   npm run typecheck
   npm run lint
   npm run build
   npm test
   ```

4. Inspect the package contents without publishing:

   ```bash
   npm pack --dry-run
   ```

5. Publish from the release commit:

   ```bash
   npm publish
   ```

6. Create and push the matching Git tag:

   ```bash
   git tag v4.0.0
   git push origin v4.0.0
   ```

## Repository metadata

The package metadata points to:

```text
https://github.com/lmn451/jsx-prop-lookup-mcp-server
```

Keep repository URLs, package version, changelog version, and tag version synchronized.

## Runtime contract

The published package is a Node.js 20+ stdio MCP server using the official TypeScript MCP v2 package and the `2026-07-28` protocol/specification line. It exposes four analysis tools and requires an allowed-root setting for deployments that should not read arbitrary client-provided paths.
