const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { resolveVersion } = require('./release-version.cjs');

try {
  const packageVersion = JSON.parse(readFileSync('package.json', 'utf8')).version;
  const releaseTags = execFileSync('git', ['tag', '--merged', 'HEAD'], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
  const version = resolveVersion({
    packageVersion,
    releaseTags,
    bumpType: process.env.BUMP_TYPE,
    overrideVersion: process.env.OVERRIDE_VERSION,
  });
  process.stdout.write(version);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
