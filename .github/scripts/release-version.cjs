const semver = require('semver');

function normalizeVersion(value, label) {
  const normalized = semver.valid(value);
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
    .map((tag) => semver.valid(tag))
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

module.exports = { resolveVersion };
