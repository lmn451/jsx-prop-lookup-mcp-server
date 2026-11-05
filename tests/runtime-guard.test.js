import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { URL } from 'node:url';

// A dependency can exit during initialization on an unsupported runtime. The

test('published executable retains its Node shebang', () => {
  assert.ok(
    readFileSync(new URL('../dist/index.js', import.meta.url), 'utf8').startsWith(
      '#!/usr/bin/env node\n'
    )
  );
});

// version guard must run before loading any of the CLI's third-party imports.
for (const json of [false, true]) {
  test(`unsupported Node rejects before CLI dependency initialization (json=${json})`, () => {
    const dependency =
      'export const parseCommandLine = () => {}; export const executeCommand = () => {}; export const renderHumanResult = () => {}; export const cliError = () => {}; process.exit(0);';
    const setup = `import {registerHooks} from 'node:module';
Object.defineProperty(process.versions, 'node', {value: '22.0.0'});
registerHooks({resolve(specifier, context, next) {
  if (specifier === './cli.js') return {url: ${JSON.stringify('data:text/javascript,' + encodeURIComponent(dependency))}, shortCircuit: true};
  return next(specifier, context);
}});`;
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        `data:text/javascript,${encodeURIComponent(setup)}`,
        'dist/index.js',
        ...(json ? ['--json'] : []),
      ],
      { encoding: 'utf8', timeout: 5000 }
    );
    assert.equal(result.status, 2, result.stderr);
    if (json) assert.match(JSON.parse(result.stdout).error.message, /Node.js 24.11.0/);
    else assert.match(result.stderr, /Node.js 24.11.0/);
  });
}
