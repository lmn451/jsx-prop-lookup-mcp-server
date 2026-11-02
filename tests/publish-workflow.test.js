import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import YAML from 'yaml';
import { Lexer, Parser, Evaluator, data } from '@actions/expressions';
import semver from 'semver';
import { truthy } from '@actions/expressions/result';

const root = fileURLToPath(new URL('..', import.meta.url));
const validator = `${root}/.github/scripts/validate-version.cjs`;

function validateVersion(version) {
  return spawnSync(process.execPath, [validator], {
    encoding: 'utf8',
    env: { ...process.env, VERSION_OVERRIDE: version },
  });
}

test('manual release version validation accepts and normalizes npm semver', () => {
  for (const [input, normalized] of [
    ['4.0.0', '4.0.0'],
    ['4.0.0+build.7', '4.0.0'],
    ['4.0.0-beta.1+build.7', '4.0.0-beta.1'],
    ['v4.0.0', '4.0.0'],
  ]) {
    const result = validateVersion(input);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, normalized);
  }
});

test('manual release version validation rejects malformed and shell input', () => {
  for (const input of [
    'not-a-version',
    '4.0.0\nhas_changes=true',
    '$(touch /tmp/nope)',
    '4.0.0; touch /tmp/nope',
  ]) {
    const result = validateVersion(input);
    assert.notEqual(result.status, 0, JSON.stringify(input));
    assert.equal(result.stdout, '');
  }
});

function releaseWorkflow() {
  const source = readFileSync(`${root}/.github/workflows/publish.yml`, 'utf8');
  const document = YAML.parseDocument(source, { uniqueKeys: true });
  assert.deepEqual(document.errors, []);
  return document.toJS();
}

function expressionValue(expression, context) {
  const dictionary = JSON.parse(JSON.stringify(context), data.reviver);
  const tokens = new Lexer(expression).lex().tokens;
  const parsed = new Parser(tokens, Object.keys(context), []).parse();
  return truthy(new Evaluator(parsed, dictionary).evaluate());
}

test('stacked PRs run tests while only master pushes start automatic releases', () => {
  const workflow = releaseWorkflow();
  assert.deepEqual(workflow.on.push.branches, ['master']);
  assert.deepEqual(workflow.on.pull_request, {});
  assert.equal(workflow.on.workflow_dispatch.inputs.publish.type, 'boolean');
  assert.equal(workflow.jobs.test.if, undefined);
  assert.equal(workflow.jobs.publish.needs, 'test');
  assert.deepEqual(workflow.jobs.test.strategy.matrix['node-version'], ['20.x', '26.x']);
});

test('only publishing receives OIDC and repository write permissions', () => {
  const workflow = releaseWorkflow();
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.equal(workflow.jobs.test.permissions, undefined);
  assert.deepEqual(workflow.jobs.publish.permissions, {
    contents: 'write',
    'id-token': 'write',
  });
  assert.deepEqual(workflow.jobs.publish.concurrency, {
    group: 'npm-publish-jsx-prop-lookup',
    'cancel-in-progress': false,
  });
  const publishStep = workflow.jobs.publish.steps.find((step) => step.id === 'npm_publish');
  assert.deepEqual(publishStep.env, {
    NEW_VERSION: '${{ steps.new_version.outputs.new_version }}',
  });
});

test('publishing uses an OIDC-capable Node runtime and disables release cache restoration', () => {
  const setup = releaseWorkflow().jobs.publish.steps.find((step) =>
    step.uses?.startsWith('actions/setup-node@')
  );
  assert.equal(setup.uses, 'actions/setup-node@v6');
  assert.ok(semver.gte(semver.minVersion(setup.with['node-version']), '22.14.0'));
  assert.equal(setup.with['registry-url'], 'https://registry.npmjs.org');
  assert.equal(setup.with['package-manager-cache'], false);
  assert.equal(setup.with.cache, undefined);
});

test('release installs pinned npm compatible with trusted publishing and its Node runtime', (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'jsx-npm-setup-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const invocationFile = path.join(directory, 'invocation.json');
  writeFileSync(
    path.join(directory, 'npm'),
    '#!/usr/bin/env node\n' +
      'require("node:fs").writeFileSync(process.env.INVOCATION_FILE, JSON.stringify(process.argv.slice(2)));\n',
    { mode: 0o755 }
  );
  const steps = releaseWorkflow().jobs.publish.steps;
  const setupIndex = steps.findIndex(
    (step) => step.name === 'Install npm with trusted publishing support'
  );
  const nodeIndex = steps.findIndex((step) => step.uses?.startsWith('actions/setup-node@'));
  const publishIndex = steps.findIndex((step) => step.id === 'npm_publish');
  assert.ok(setupIndex > nodeIndex && setupIndex < publishIndex);
  const result = spawnSync(
    'bash',
    ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', steps[setupIndex].run],
    {
      cwd: directory,
      encoding: 'utf8',
      timeout: 5000,
      env: {
        ...process.env,
        PATH: `${directory}${path.delimiter}${process.env.PATH}`,
        INVOCATION_FILE: invocationFile,
      },
    }
  );
  assert.equal(result.status, 0, result.stderr);
  const args = JSON.parse(readFileSync(invocationFile, 'utf8'));
  assert.deepEqual(args, ['install', '--global', 'npm@12.0.2']);
  // npm 12.0.2's published engine contract; update alongside the deliberate pin.
  assert.ok(
    semver.satisfies(
      semver.minVersion(steps[nodeIndex].with['node-version']),
      '^22.22.2 || ^24.15.0 || >=26.0.0'
    )
  );
});

for (const [eventName, ref, publish, expected] of [
  ['push', 'refs/heads/master', false, true],
  ['push', 'refs/heads/main', false, false],
  ['push', 'refs/heads/feature', false, false],
  ['pull_request', 'refs/pull/14/merge', true, false],
  ['pull_request', 'refs/heads/master', true, false],
  ['workflow_dispatch', 'refs/heads/master', true, true],
  ['workflow_dispatch', 'refs/heads/master', false, false],
  ['workflow_dispatch', 'refs/heads/feature', true, false],
  ['workflow_dispatch', 'refs/tags/v4.0.0', true, false],
]) {
  test(`release eligibility: ${eventName} on ${ref}, publish=${publish}`, () => {
    assert.equal(
      expressionValue(releaseWorkflow().jobs.publish.if, {
        github: { event_name: eventName, ref },
        inputs: { publish },
      }),
      expected
    );
  });
}

for (const [npmExit, expectedOutputs, scenario] of [
  [0, 'publish_success=true\n', 'records successful npm publication'],
  [1, '', 'stops without claiming success after npm failure'],
]) {
  test(`release shell ${scenario}`, (t) => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'jsx-publish-step-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const invocationFile = path.join(directory, 'invocation.json');
    const outputFile = path.join(directory, 'github-output');
    writeFileSync(outputFile, '');
    writeFileSync(
      path.join(directory, 'npm'),
      '#!/usr/bin/env node\n' +
        'require("node:fs").writeFileSync(process.env.INVOCATION_FILE, JSON.stringify(process.argv.slice(2)));\n' +
        'process.exit(Number(process.env.NPM_TEST_EXIT));\n',
      { mode: 0o755 }
    );
    const step = releaseWorkflow().jobs.publish.steps.find((item) => item.id === 'npm_publish');
    const result = spawnSync(
      'bash',
      ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', step.run],
      {
        cwd: directory,
        encoding: 'utf8',
        timeout: 5000,
        env: {
          ...process.env,
          PATH: `${directory}${path.delimiter}${process.env.PATH}`,
          NEW_VERSION: '4.0.0',
          GITHUB_OUTPUT: outputFile,
          INVOCATION_FILE: invocationFile,
          NPM_TEST_EXIT: String(npmExit),
        },
      }
    );
    assert.equal(result.status, npmExit, result.stderr);
    assert.deepEqual(JSON.parse(readFileSync(invocationFile, 'utf8')), [
      'publish',
      '--access',
      'public',
      '--registry=https://registry.npmjs.org',
    ]);
    assert.equal(readFileSync(outputFile, 'utf8'), expectedOutputs);
  });
}

test('tagging and GitHub releases require successful npm publication', () => {
  const steps = releaseWorkflow().jobs.publish.steps;
  for (const name of ['Commit version bump and create tag', 'Create GitHub Release']) {
    const step = steps.find((item) => item.name === name);
    for (const [hasChanges, published, expected] of [
      ['true', 'true', true],
      ['true', '', false],
      ['false', 'true', false],
    ]) {
      assert.equal(
        expressionValue(step.if, {
          steps: {
            changes: { outputs: { has_changes: hasChanges } },
            npm_publish: { outputs: { publish_success: published } },
          },
        }),
        expected,
        name
      );
    }
  }
});

test('tagging pushes prepared versions with or without a version file change', (t) => {
  const step = releaseWorkflow().jobs.publish.steps.find(
    (item) => item.name === 'Commit version bump and create tag'
  );

  for (const [scenario, changeVersion] of [
    ['unchanged prepared version', false],
    ['changed bumped version', true],
  ]) {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'jsx-tagging-step-'));
    t.after(() => rmSync(directory, { recursive: true, force: true }));
    const repository = path.join(directory, 'repository');
    const remote = path.join(directory, 'remote.git');
    const runGit = (cwd, args) => {
      const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
      return result.stdout.trim();
    };
    runGit(directory, ['init', '--bare', remote]);
    runGit(directory, ['init', repository]);
    runGit(repository, ['config', 'user.name', 'Release Test']);
    runGit(repository, ['config', 'user.email', 'release-test@example.invalid']);
    writeFileSync(path.join(repository, 'package.json'), '{"version":"4.0.0"}\n');
    writeFileSync(path.join(repository, 'package-lock.json'), '{"version":"4.0.0"}\n');
    runGit(repository, ['add', 'package.json', 'package-lock.json']);
    runGit(repository, ['commit', '-m', 'initial']);
    runGit(repository, ['remote', 'add', 'origin', remote]);
    runGit(repository, ['push', 'origin', 'HEAD']);

    if (changeVersion) {
      writeFileSync(path.join(repository, 'package.json'), '{"version":"4.0.1"}\n');
      writeFileSync(path.join(repository, 'package-lock.json'), '{"version":"4.0.1"}\n');
    }

    const result = spawnSync(
      'bash',
      ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', step.run],
      {
        cwd: repository,
        encoding: 'utf8',
        timeout: 10000,
        env: { ...process.env, NEW_VERSION: changeVersion ? '4.0.1' : '4.0.0' },
      }
    );
    assert.equal(result.status, 0, `${scenario}: ${result.stderr}`);
    const tag = changeVersion ? 'v4.0.1' : 'v4.0.0';
    assert.equal(runGit(repository, ['tag', '--list']), tag);
    assert.equal(runGit(remote, ['tag', '--list']), tag);
    assert.equal(
      runGit(remote, ['rev-parse', `refs/tags/${tag}`]),
      runGit(repository, ['rev-parse', 'HEAD'])
    );
    assert.equal(
      runGit(repository, ['show', '-s', '--format=%s', 'HEAD']),
      changeVersion ? 'chore: bump version to v4.0.1 [skip ci]' : 'initial'
    );
  }
});
