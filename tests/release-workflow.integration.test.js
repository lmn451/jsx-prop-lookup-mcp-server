import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const resolver = fileURLToPath(new URL('../.github/scripts/resolve-version.cjs', import.meta.url));

function repository(t, version) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-release-workflow-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        !key.startsWith('GIT_') &&
        !['PACKAGE_VERSION', 'RELEASE_TAGS', 'BUMP_TYPE', 'OVERRIDE_VERSION'].includes(key)
    )
  );
  Object.assign(env, {
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: path.join(directory, 'empty.gitconfig'),
    GIT_AUTHOR_NAME: 'Release tests',
    GIT_AUTHOR_EMAIL: 'tests@example.invalid',
    GIT_COMMITTER_NAME: 'Release tests',
    GIT_COMMITTER_EMAIL: 'tests@example.invalid',
  });
  fs.writeFileSync(env.GIT_CONFIG_GLOBAL, '');
  const git = (...args) => execFileSync('git', args, { cwd: directory, env, stdio: 'pipe' });
  git('init', '--quiet', '--initial-branch=main', '--template=');
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ version }));
  git('add', 'package.json');
  git('commit', '--quiet', '-m', 'Prepare package version');
  const run = (variables = {}) =>
    spawnSync(process.execPath, [resolver], {
      cwd: directory,
      env: { ...env, BUMP_TYPE: 'patch', ...variables },
      encoding: 'utf8',
      timeout: 5000,
    });
  return { directory, git, run };
}

test('release command reads the prepared version and real repository tags', (t) => {
  const { git, run } = repository(t, '4.0.0');
  git('tag', 'v3.5.0');

  const result = run({ BUMP_TYPE: 'minor' });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '4.0.0');
  assert.equal(result.stderr, '');
});

test('release command ignores tags on commits outside the current history', (t) => {
  const { directory, git, run } = repository(t, '4.0.0');
  git('tag', 'v4.0.0');
  git('checkout', '--quiet', '-b', 'future-release');
  fs.writeFileSync(path.join(directory, 'future.txt'), 'another branch');
  git('add', 'future.txt');
  git('commit', '--quiet', '-m', 'Future release');
  git('tag', 'v5.0.0');
  git('checkout', '--quiet', 'main');

  const result = run({ BUMP_TYPE: 'minor' });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '4.1.0');
});

test('release command forwards and normalizes an explicit version override', (t) => {
  const { git, run } = repository(t, '5.0.0');
  git('tag', 'v5.0.0');

  const result = run({ BUMP_TYPE: 'major', OVERRIDE_VERSION: '4.2.0+build.7' });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '4.2.0');
});

test('release command fails without emitting a version when the package is behind a release', (t) => {
  const { git, run } = repository(t, '3.9.0');
  git('tag', 'v4.0.0');

  const result = run();

  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /Package version 3\.9\.0 is older than latest release 4\.0\.0/);
});
