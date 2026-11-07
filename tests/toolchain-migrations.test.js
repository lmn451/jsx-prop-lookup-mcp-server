import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { ESLint } from 'eslint';
import parser from '@typescript-eslint/parser';

function fixture(t, files) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-toolchain-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const [name, source] of Object.entries(files)) {
    const file = path.join(directory, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, source);
  }
  return directory;
}

test('ESLint selects nested glob matches and applies ignored-file configuration', async (t) => {
  const directory = fixture(t, {
    'src/a.js': 'debugger;',
    'src/nested/b.js': 'debugger;',
    'src/skip.js': 'debugger;',
    'other.js': 'debugger;',
  });
  const eslint = new ESLint({
    cwd: directory,
    overrideConfigFile: true,
    overrideConfig: [
      { ignores: ['**/skip.js'] },
      { files: ['src/**/*.js'], rules: { 'no-debugger': 'error' } },
    ],
  });
  const results = await eslint.lintFiles(['src/**/*.js']);
  assert.deepEqual(results.map(({ filePath }) => path.relative(directory, filePath)).sort(), [
    path.join('src', 'a.js'),
    path.join('src', 'nested', 'b.js'),
  ]);
  assert.ok(
    results.every(({ messages }) => messages.length === 1 && messages[0].ruleId === 'no-debugger')
  );
  assert.equal(await eslint.isPathIgnored(path.join(directory, 'src/skip.js')), true);
});

test('typescript-eslint project service matches allowed default-project files', (t) => {
  const source = 'const count: number = 1;';
  const directory = fixture(t, {
    'tsconfig.json': JSON.stringify({
      compilerOptions: { strict: true },
      include: ['src/**/*.ts'],
    }),
    'src/included.ts': source,
    'loose.ts': source,
    'blocked.ts': source,
  });
  t.after(() => parser.clearCaches());
  const options = {
    tsconfigRootDir: directory,
    projectService: { allowDefaultProject: ['loose.ts'] },
  };
  const parsed = parser.parseForESLint(source, {
    ...options,
    filePath: path.join(directory, 'loose.ts'),
  });
  const program = parsed.services.program;
  assert.ok(program);
  const file = program.getSourceFile(path.join(directory, 'loose.ts'));
  const checker = program.getTypeChecker();
  assert.equal(
    checker.typeToString(
      checker.getTypeAtLocation(file.statements[0].declarationList.declarations[0].name)
    ),
    'number'
  );
  assert.throws(
    () =>
      parser.parseForESLint(source, { ...options, filePath: path.join(directory, 'blocked.ts') }),
    /not found by the project service/
  );
});

test('Stryker TAP discovers nested test patterns and excludes node_modules', async (t) => {
  const directory = fixture(t, {
    'one.test.js': 'export {};',
    'nested/two.spec.js': 'export {};',
    'nested/helper.js': 'export {};',
    'node_modules/ignored.test.js': 'export {};',
  });
  const require = createRequire(import.meta.url);
  const entry = pathToFileURL(require.resolve('@stryker-mutator/tap-runner'));
  const { findTestyLookingFiles } = await import(new URL('./tap-helper.js', entry));
  const files = await findTestyLookingFiles([
    `${directory.split(path.sep).join('/')}/**/*.{test,spec}.js`,
  ]);
  assert.deepEqual(files.sort(), [
    path.join(directory, 'nested/two.spec.js').split(path.sep).join('/'),
    path.join(directory, 'one.test.js').split(path.sep).join('/'),
  ]);
});

test('Stryker REST client preserves query options and handles comma arrays without crashing', () => {
  const require = createRequire(import.meta.url);
  const coreRequire = createRequire(require.resolve('@stryker-mutator/core/package.json'));
  const { getUrl } = coreRequire('typed-rest-client/Util.js');
  const url = getUrl('https://example.test/report', undefined, {
    params: { filter: { name: 'hello world' }, items: ['first', null, undefined, 'last'] },
    options: { arrayFormat: 'comma', shouldAllowDots: true, separator: ';' },
  });
  const query = new URLSearchParams(url.split('?')[1].replaceAll(';', '&'));
  assert.equal(query.get('filter.name'), 'hello world');
  assert.equal(query.get('items'), 'first,,,last');
  assert.doesNotThrow(() =>
    getUrl('https://example.test/report', undefined, {
      params: { items: [{ toString: 42 }, 'ok'] },
      options: { arrayFormat: 'comma' },
    })
  );
});
