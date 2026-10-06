const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const semver = require('semver');

function normalizeVersion(value, label) {
  const normalized = semver.valid(value, { loose: false });
  if (normalized === null) {
    throw new Error(`${label} is not valid npm semver: ${value}`);
  }
  return normalized;
}

function resolveVersion({ packageVersion, releaseTags, bumpType, overrideVersion }) {
  if (overrideVersion) {
    return normalizeVersion(overrideVersion, 'Version override');
  }

  const preparedVersion = normalizeVersion(packageVersion, 'Package version');
  const latestReleaseVersion = releaseTags
    .map((tag) => semver.valid(tag, { loose: false }))
    .filter((version) => version !== null)
    .sort(semver.rcompare)[0];

  if (latestReleaseVersion === undefined || semver.gt(preparedVersion, latestReleaseVersion)) {
    return preparedVersion;
  }

  if (semver.lt(preparedVersion, latestReleaseVersion)) {
    throw new Error(
      `Package version ${preparedVersion} is older than latest release ${latestReleaseVersion}`
    );
  }

  const bumpedVersion = semver.inc(preparedVersion, bumpType);
  if (bumpedVersion === null) {
    throw new Error(`Unsupported version bump type: ${bumpType}`);
  }
  return bumpedVersion;
}

function getReleaseTags() {
  if (Object.hasOwn(process.env, 'RELEASE_TAGS')) {
    return process.env.RELEASE_TAGS.split('\n').filter(Boolean);
  }
  return execFileSync('git', ['tag', '--merged', 'HEAD'], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
}

try {
  const packageVersion = Object.hasOwn(process.env, 'PACKAGE_VERSION')
    ? process.env.PACKAGE_VERSION
    : JSON.parse(readFileSync('package.json', 'utf8')).version;
  const version = resolveVersion({
    packageVersion,
    releaseTags: getReleaseTags(),
    bumpType: process.env.BUMP_TYPE,
    overrideVersion: process.env.OVERRIDE_VERSION,
  });
  process.stdout.write(version);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}

module.exports = { resolveVersion };
