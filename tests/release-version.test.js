import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const resolver = `${root}/.github/scripts/resolve-version.cjs`;

function resolveVersion({ packageVersion, releaseTags, bumpType = 'patch', overrideVersion = '' }) {
  return spawnSync(process.execPath, [resolver], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      PACKAGE_VERSION: packageVersion,
      RELEASE_TAGS: releaseTags.join('\n'),
      BUMP_TYPE: bumpType,
      OVERRIDE_VERSION: overrideVersion,
    },
  });
}

test('prepared package version is used when newer than the latest valid release', () => {
  const result = resolveVersion({
    packageVersion: '4.0.0',
    releaseTags: ['v3.5.0', 'not-a-version'],
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '4.0.0');
});

test('equal released and package versions use the commit-derived bump', () => {
  for (const [bumpType, expected] of [
    ['patch', '4.0.1'],
    ['minor', '4.1.0'],
    ['major', '5.0.0'],
  ]) {
    const result = resolveVersion({ packageVersion: '4.0.0', releaseTags: ['v4.0.0'], bumpType });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, expected);
  }
});

test('prepared prereleases and matching prerelease tags use semver ordering', () => {
  const prepared = resolveVersion({ packageVersion: '4.1.0-beta.1', releaseTags: ['v4.0.0'] });
  assert.equal(prepared.status, 0, prepared.stderr);
  assert.equal(prepared.stdout, '4.1.0-beta.1');

  const bump = resolveVersion({ packageVersion: '4.1.0-beta.1', releaseTags: ['v4.1.0-beta.1'] });
  assert.equal(bump.status, 0, bump.stderr);
  assert.equal(bump.stdout, '4.1.0');
});

test('without valid release tags the committed package version is used', () => {
  const result = resolveVersion({ packageVersion: '4.0.0', releaseTags: ['release-3', ''] });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '4.0.0');
});

test('normalized manual overrides take precedence over prepared and tagged versions', () => {
  const result = resolveVersion({
    packageVersion: '5.0.0',
    releaseTags: ['v5.0.0'],
    bumpType: 'major',
    overrideVersion: '4.2.0+build.7',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '4.2.0');
});

test('a package version behind the latest release fails visibly', () => {
  const result = resolveVersion({ packageVersion: '3.9.0', releaseTags: ['v4.0.0'] });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /older than latest release/);
});
