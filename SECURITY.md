Security and safe operation

Important: this MCP server reads files and directories on disk based on client-provided paths. Do NOT expose the stdio-based server to untrusted or network-exposed clients. By default there is no filesystem whitelist; to restrict filesystem access, set the `ALLOWED_ROOTS` environment variable to a comma-separated list of allowed root directories (absolute or workspace-relative), or pass the same setting using the `--allowed-roots` CLI flag. When configured, any tool request that refers to a path outside the allowed roots will be rejected.

Environment variable example (restrict to the repository root):

```bash
export ALLOWED_ROOTS="."
npm run dev
```

CLI examples:

```bash
# Restrict to the current repository root (workspace-relative)
node --import=tsx src/index.ts --allowed-roots .

# Or provide absolute paths (comma-separated)
node --import=tsx src/index.ts --allowed-roots /home/user/project,/tmp/safe-area
```

Recommended practices:

- Run this server only in trusted environments, or behind an authenticated proxy.
- Use `ALLOWED_ROOTS` or the CLI flag to limit the scope of accessible files.
- Do not run the server as a privileged user; run under a least-privileged account.
- Consider further sandboxing (containerization) when servicing untrusted inputs.
