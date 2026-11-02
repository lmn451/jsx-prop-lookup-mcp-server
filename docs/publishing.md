# Automatic npm releases

The `Build, Test & Publish` workflow tests every pull request, including PRs whose
base is another feature branch in a stack. Release jobs run only from `master`
after the test jobs succeed. Feature branches and pull requests cannot publish.

A release-worthy merge triggers the existing version-selection process:

- A prepared package version newer than the release tags is published as-is.
- Otherwise, commit-message hints select a major or minor bump; the fallback is
  a patch bump.
- Documentation-only and workflow-only changes do not force a release.
- A manual run from `master` can enable `publish` and optionally specify a version.

The workflow updates and tests the selected package version, publishes it, then
commits the version bump and creates the tag and GitHub release. Publication must
succeed before the tag or release is created. Release jobs are serialized and an
active publication is not cancelled by a newer run.

## One-time npm trusted-publisher setup

Before merging the publishing change, configure this existing npm package to
trust the GitHub Actions workflow:

| Setting           | Value                                                            |
| ----------------- | ---------------------------------------------------------------- |
| Package           | `jsx-prop-lookup-mcp-server`                                     |
| Provider          | GitHub Actions                                                   |
| Organization/user | `lmn451`                                                         |
| Repository        | `jsx-prop-lookup-mcp-server`                                     |
| Workflow filename | `publish.yml`                                                    |
| Environment       | Leave empty; this workflow does not use a deployment environment |
| Allowed action    | Direct publishing with `npm publish`                             |

An authenticated maintainer can configure the same relationship using npm 11.15+
with account two-factor authentication enabled:

```bash
npm trust github jsx-prop-lookup-mcp-server \
  --repository lmn451/jsx-prop-lookup-mcp-server \
  --file publish.yml \
  --allow-publish
```

Complete npm's authentication prompt. A newly created trust relationship must
complete its first successful publish within two days or it expires. Create it
when the release is ready to merge, or recreate an expired entry before release.

The publish job uses a GitHub-hosted runner, Node 26, npm 12.0.2, and job-scoped
`id-token: write`. npm exchanges the GitHub OIDC identity for publishing
credentials. The workflow does not read `NPM_TOKEN`; no replacement token secret
is required. The test jobs retain read-only repository permissions. Release
builds do not restore the setup-node package-manager cache.

npm creates provenance automatically for this public repository/package. See
[npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) for setup,
runtime requirements, and troubleshooting. The trust entry must match the
repository and workflow filename exactly; a green PR alone does not prove that
the npm-side relationship has been configured. Verify the first release run and
the resulting npm version after merging.
