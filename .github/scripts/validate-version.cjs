const semver = require('semver');

const normalized = semver.valid(process.env.VERSION_OVERRIDE, { loose: false });

if (normalized === null) {
  process.stderr.write('Invalid version override: expected npm semver\n');
  process.exitCode = 1;
} else {
  process.stdout.write(normalized);
}
