import assert from 'node:assert/strict';
import test from 'node:test';
import releaseVersion from '../.github/scripts/release-version.cjs';

const { resolveVersion } = releaseVersion;

function release(overrides = {}) {
  return {
    packageVersion: '4.0.0',
    releaseTags: ['v4.0.0'],
    bumpType: 'patch',
    overrideVersion: '',
    ...overrides,
  };
}

const releases = [
  {
    name: 'uses the prepared package version when newer than the latest release',
    input: { releaseTags: ['v3.5.0', 'not-a-version'] },
    expected: '4.0.0',
  },
  {
    name: 'bumps the patch when the package version is already released',
    input: { bumpType: 'patch' },
    expected: '4.0.1',
  },
  {
    name: 'bumps the minor when the package version is already released',
    input: { bumpType: 'minor' },
    expected: '4.1.0',
  },
  {
    name: 'bumps the major when the package version is already released',
    input: { bumpType: 'major' },
    expected: '5.0.0',
  },
  {
    name: 'uses a prepared prerelease newer than the previous stable release',
    input: { packageVersion: '4.1.0-beta.1' },
    expected: '4.1.0-beta.1',
  },
  {
    name: 'promotes a matching prerelease tag using semver patch rules',
    input: { packageVersion: '4.1.0-beta.1', releaseTags: ['v4.1.0-beta.1'] },
    expected: '4.1.0',
  },
  {
    name: 'uses the committed version when there are no release tags',
    input: { releaseTags: [] },
    expected: '4.0.0',
  },
  {
    name: 'ignores tags that are not valid release versions',
    input: { releaseTags: ['release-3', ''] },
    expected: '4.0.0',
  },
  {
    name: 'ignores loosely formatted tags when finding the latest release',
    input: { releaseTags: ['v09.0.0', 'v4.0.0'] },
    expected: '4.0.1',
  },
  {
    name: 'selects the highest release version regardless of tag order',
    input: { releaseTags: ['v3.0.0', 'v4.0.0', 'v3.5.0'] },
    expected: '4.0.1',
  },
  {
    name: 'gives a normalized manual override precedence over the prepared version and bump',
    input: {
      packageVersion: '5.0.0',
      releaseTags: ['v5.0.0'],
      bumpType: 'major',
      overrideVersion: '4.2.0+build.7',
    },
    expected: '4.2.0',
  },
];

for (const { name, input, expected } of releases) {
  test(name, () => {
    const result = resolveVersion(release(input));

    assert.equal(result, expected);
  });
}

test('rejects a package version older than the latest release', () => {
  const input = release({ packageVersion: '3.9.0' });

  assert.throws(
    () => resolveVersion(input),
    /Package version 3\.9\.0 is older than latest release 4\.0\.0/
  );
});

const invalidReleases = [
  {
    name: 'rejects a package version with a leading zero',
    input: { packageVersion: '04.0.0' },
    expected: /Package version is not valid npm semver: 04\.0\.0/,
  },
  {
    name: 'rejects an explicit override with a leading zero',
    input: { overrideVersion: '04.2.0' },
    expected: /Version override is not valid npm semver: 04\.2\.0/,
  },
  {
    name: 'rejects an unsupported bump when the package is already released',
    input: { bumpType: 'invalid' },
    expected: /Unsupported version bump type: invalid/,
  },
];

for (const { name, input, expected } of invalidReleases) {
  test(name, () => {
    assert.throws(() => resolveVersion(release(input)), expected);
  });
}
