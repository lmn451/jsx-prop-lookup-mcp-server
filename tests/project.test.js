import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
import { ProjectWorkspace } from '../dist/project.js';
import { JSXPropAnalyzer } from '../dist/jsx-analyzer.js';

// Integration slice: project selection -> filesystem boundary -> analyzer.
// ProjectWorkspace, TypeScript configuration, ignore matching, analyzer, and real
// temporary filesystem are inside this slice. There are no mocked dependencies.
// Decisions: ignored/tsconfig-excluded explicit files return []; configs are
// root-local only, default tsconfig is root/tsconfig.json, empty projects are valid.
function fixture(t, files = {}) {
  const parent = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-project-')));
  const root = path.join(parent, 'project');
  fs.mkdirSync(root);
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), content);
  }
  return { parent, root, project: new ProjectWorkspace({ root }) };
}
const jsx = 'const view = <Widget title="inside" />;';
const names = (root, files) => files.map((file) => path.relative(root, file));

test('configured project selects included source independently of the working directory', async (t) => {
  const { root, project } = fixture(t, {
    'src/A.tsx': jsx,
    'ignored/I.tsx': 'const view = <Widget title="hidden" />;',
    'other/B.tsx': jsx,
    '.gitignore': 'ignored/\n',
    'tsconfig.json': '{"include":["src/**/*.tsx"]}',
  });
  assert.deepEqual(names(root, await project.discover()), ['src/A.tsx']);
  const analyzer = new JSXPropAnalyzer({ root });
  assert.deepEqual(
    (await analyzer.findPropUsage('title', '.')).map((u) => u.value),
    ['inside']
  );
  assert.equal(project.readFile('src/A.tsx'), jsx);
  assert.equal(project.resolve('src/A.tsx'), fs.realpathSync(path.join(root, 'src/A.tsx')));
});

for (const [input, expected] of [
  ['src', ['src/A.tsx']],
  ['src/A.tsx', ['src/A.tsx']],
  ['hidden/I.tsx', []],
  ['other/B.tsx', []],
  ['notes.txt', []],
]) {
  test(`explicit selection obeys project rules: ${input}`, async (t) => {
    const { root, project } = fixture(t, {
      'src/A.tsx': jsx,
      'hidden/I.tsx': jsx,
      'other/B.tsx': jsx,
      'notes.txt': 'notes',
      '.gitignore': 'hidden/\n',
      'tsconfig.json': '{"include":["src/**/*.tsx"]}',
    });
    assert.deepEqual(names(root, await project.discover(input)), expected);
  });
}

test('nested ignore negation restores files but cannot restore an excluded parent directory', async (t) => {
  const { root, project } = fixture(t, {
    '.gitignore': '*.tsx\n!src/\nblocked/\n!blocked/Keep.tsx\n',
    'src/.gitignore': '!Keep.tsx\n',
    'src/Keep.tsx': jsx,
    'src/Drop.tsx': jsx,
    'blocked/Keep.tsx': jsx,
    'Plain.jsx': jsx,
    'code.ts': 'export const value = 1;',
    'code.js': 'export const n = 1;',
  });
  assert.deepEqual(names(root, await project.discover()), [
    'Plain.jsx',
    'code.js',
    'code.ts',
    'src/Keep.tsx',
  ]);
  assert.deepEqual(await project.discover('blocked/Keep.tsx'), []);
});

test('ignore files are loaded relative to the project even when querying a nested folder', async (t) => {
  const { root, project } = fixture(t, {
    '.gitignore': 'src/Drop.tsx\n',
    'src/.gitignore': 'Nested.tsx\n',
    'src/A.tsx': jsx,
    'src/Drop.tsx': jsx,
    'src/Nested.tsx': jsx,
  });
  assert.deepEqual(names(root, await project.discover('src')), ['src/A.tsx']);
});

test('in-root extended config preserves TypeScript include, exclude, and explicit files semantics', async (t) => {
  const { root, project } = fixture(t, {
    'config/base.json':
      '{"compilerOptions":{"jsx":"react-jsx","strict":true},"include":["../src/**/*.tsx"],"exclude":["../src/Skip.tsx"]}',
    'tsconfig.json': '{"extends":"./config/base.json","files":["extra/Only.tsx"]}',
    'src/A.tsx': jsx,
    'src/Skip.tsx': jsx,
    'extra/Only.tsx': jsx,
    'extra/No.tsx': jsx,
  });
  assert.deepEqual(names(root, await project.discover()), ['extra/Only.tsx', 'src/A.tsx']);
  assert.equal(project.getCompilerOptions().strict, true);
});

test('custom config selection and JavaScript inclusion use TypeScript options', async (t) => {
  const { root } = fixture(t, {
    'jsconfig.json': '{"compilerOptions":{"allowJs":true},"include":["src/*"]}',
    'src/A.jsx': jsx,
    'src/B.js': 'export const n = 1;',
    'src/C.tsx': jsx,
    'No.tsx': jsx,
  });
  assert.deepEqual(
    names(root, await new ProjectWorkspace({ root, tsconfig: 'jsconfig.json' }).discover()),
    ['src/A.jsx', 'src/B.js', 'src/C.tsx']
  );
});

test('empty projects and an explicitly empty file list return no files', async (t) => {
  const { root, project } = fixture(t);
  assert.deepEqual(await project.discover(), []);
  fs.writeFileSync(path.join(root, 'tsconfig.json'), '{"files":[]}');
  assert.deepEqual(await project.discover(), []);
});

test('project configuration and ignore changes are reflected in subsequent queries', async (t) => {
  const { root, project } = fixture(t, { 'A.tsx': jsx, 'B.tsx': jsx });
  assert.deepEqual(names(root, await project.discover()), ['A.tsx', 'B.tsx']);
  fs.writeFileSync(path.join(root, '.gitignore'), 'B.tsx');
  assert.deepEqual(names(root, await project.discover()), ['A.tsx']);
  fs.writeFileSync(path.join(root, 'tsconfig.json'), '{"files":["B.tsx"]}');
  assert.deepEqual(await project.discover(), []);
});

for (const variant of ['parent', 'absolute', 'prefix-sibling', 'file-link', 'directory-link']) {
  test(`rejects outside project access: ${variant}`, async (t) => {
    const { parent, root, project } = fixture(t, { 'A.tsx': jsx });
    const outside = path.join(parent, 'outside');
    const sibling = `${root}-extra`;
    fs.mkdirSync(outside);
    fs.mkdirSync(sibling);
    fs.writeFileSync(path.join(outside, 'Secret.tsx'), 'const view = <Widget title="secret" />;');
    fs.symlinkSync(path.join(outside, 'Secret.tsx'), path.join(root, 'link.tsx'));
    fs.symlinkSync(outside, path.join(root, 'linked'), 'dir');
    const inputs = {
      parent: '../outside',
      absolute: outside,
      'prefix-sibling': sibling,
      'file-link': 'link.tsx',
      'directory-link': 'linked',
    };
    await assert.rejects(project.discover(inputs[variant]), /outside project root/);
    assert.throws(() => project.readFile(inputs[variant]), /outside project root/);
  });
}

for (const kind of ['file', 'directory']) {
  test(`directory discovery rejects an outside ${kind} symlink`, async (t) => {
    const { root, parent, project } = fixture(t, { 'A.tsx': jsx });
    const outside = path.join(parent, kind === 'file' ? 'Secret.tsx' : 'outside');
    if (kind === 'file') fs.writeFileSync(outside, jsx);
    else {
      fs.mkdirSync(outside);
      fs.writeFileSync(path.join(outside, 'Secret.tsx'), jsx);
    }
    fs.symlinkSync(
      outside,
      path.join(root, kind === 'file' ? 'link.tsx' : 'linked'),
      kind === 'file' ? 'file' : 'dir'
    );
    await assert.rejects(project.discover(), /outside project root/);
  });
}

test('allowed roots also constrain the configured root', async (t) => {
  const { root, parent } = fixture(t, { 'A.tsx': jsx });
  const allowed = new ProjectWorkspace({ root, allowedRoots: [parent] });
  assert.deepEqual(names(root, await allowed.discover()), ['A.tsx']);
  assert.throws(
    () => new ProjectWorkspace({ root, allowedRoots: [path.join(parent, 'elsewhere')] }),
    /outside allowed roots/
  );
});

for (const [config, expected] of [
  ['{"extends":"../outside.json"}', /outside project root|Cannot read file|not found/],
  ['{"files":["../Outside.tsx"]}', /outside project root/],
  ['{"include":["../**/*.tsx"]}', /outside project root/],
  ['{"compilerOptions":{"jsx":"banana"}}', /jsx/],
  ['{ invalid json', /config|Property assignment expected/],
]) {
  test(`rejects invalid or escaping configuration: ${config}`, async (t) => {
    const { parent, project } = fixture(t, { 'tsconfig.json': config, 'A.tsx': jsx });
    fs.writeFileSync(path.join(parent, 'outside.json'), '{}');
    fs.writeFileSync(path.join(parent, 'Outside.tsx'), jsx);
    await assert.rejects(project.discover(), expected);
  });
}

test('outside symlinked configs and ignore files are rejected without reading their contents', async (t) => {
  const { root, parent, project } = fixture(t, { 'A.tsx': jsx });
  const outside = path.join(parent, 'outside.json');
  fs.writeFileSync(outside, '{}');
  fs.symlinkSync(outside, path.join(root, 'tsconfig.json'));
  await assert.rejects(project.discover(), /outside project root/);
  fs.unlinkSync(path.join(root, 'tsconfig.json'));
  fs.symlinkSync(outside, path.join(root, '.gitignore'));
  await assert.rejects(project.discover(), /outside project root/);
});

test('missing paths and custom configurations produce actionable errors', async (t) => {
  const { root, project } = fixture(t);
  await assert.rejects(project.discover('missing'), /missing/);
  await assert.rejects(project.discover(''), /non-empty/);
  await assert.rejects(
    new ProjectWorkspace({ root, tsconfig: 'missing.json' }).discover(),
    /missing.json/
  );
});

test('internal symlink directories are followed once without infinite cycles', async (t) => {
  const { root, project } = fixture(t, { 'src/A.tsx': jsx });
  fs.symlinkSync(root, path.join(root, 'src/cycle'), 'dir');
  assert.deepEqual(names(root, await project.discover()), ['src/A.tsx']);
});

test('a root configured through a symlink accepts both root spellings', async (t) => {
  const { root, parent } = fixture(t, { 'A.tsx': jsx });
  const alias = path.join(parent, 'alias');
  fs.symlinkSync(root, alias, 'dir');
  const project = new ProjectWorkspace({ root: alias });
  assert.equal(project.root, root);
  assert.deepEqual(names(root, await project.discover(alias)), ['A.tsx']);
  assert.deepEqual(names(root, await project.discover(root)), ['A.tsx']);
});

test('read boundaries reject symlink replacement after a successful discovery', async (t) => {
  const { root, parent, project } = fixture(t, { 'A.tsx': jsx });
  const [file] = await project.discover();
  const outside = path.join(parent, 'Secret.tsx');
  fs.writeFileSync(outside, 'secret');
  fs.unlinkSync(file);
  fs.symlinkSync(outside, path.join(root, 'A.tsx'));
  assert.throws(() => project.readFile(file), /outside project root/);
});

// Mutation feedback: cover setup contracts that the first acceptance set omitted.
for (const excluded of ['.git', 'node_modules', 'dist', 'build']) {
  test(`default discovery exclusions apply to ${excluded}`, async (t) => {
    const { root, project } = fixture(t, { 'A.tsx': jsx, [`${excluded}/Ignored.tsx`]: jsx });
    assert.deepEqual(names(root, await project.discover()), ['A.tsx']);
  });
}

test('any matching allowed root permits access while prefix siblings do not', async (t) => {
  const { root, parent } = fixture(t, { 'A.tsx': jsx });
  const other = path.join(parent, 'other');
  fs.mkdirSync(other);
  assert.deepEqual(
    names(root, await new ProjectWorkspace({ root, allowedRoots: [other, root] }).discover()),
    ['A.tsx']
  );
  assert.throws(
    () => new ProjectWorkspace({ root, allowedRoots: [other, `${root}-extra`] }),
    /outside allowed roots/
  );
});

test('non-directory project roots and nonexistent outside paths are rejected', async (t) => {
  const { root, project } = fixture(t, { 'A.tsx': jsx });
  assert.throws(
    () => new ProjectWorkspace({ root: path.join(root, 'A.tsx') }),
    /Project root is not a directory/
  );
  await assert.rejects(project.discover('../missing.tsx'), /outside project root/);
});

test('nested root symlinks retain canonical absolute query behavior', async (t) => {
  const { parent, root } = fixture(t, { 'A.tsx': jsx });
  const aliases = path.join(parent, 'links/deep');
  fs.mkdirSync(aliases, { recursive: true });
  const alias = path.join(aliases, 'project');
  fs.symlinkSync(root, alias, 'dir');
  const project = new ProjectWorkspace({ root: alias });
  assert.deepEqual(names(root, await project.discover(root)), ['A.tsx']);
  assert.equal(project.readFile(path.join(root, 'A.tsx')), jsx);
});

test('ignored directories are not traversed to read nested ignore files', async (t) => {
  const { parent, root, project } = fixture(t, {
    '.gitignore': 'blocked/\n',
    'blocked/A.tsx': jsx,
  });
  const outside = path.join(parent, 'outside-ignore');
  fs.writeFileSync(outside, '*');
  fs.symlinkSync(outside, path.join(root, 'blocked/.gitignore'));
  assert.deepEqual(await project.discover(), []);
});

test('source paths are sorted across directory and filename boundaries', async (t) => {
  const { root, project } = fixture(t, { 'a/Z.tsx': jsx, 'a.tsx': jsx, 'a/A.tsx': jsx });
  assert.deepEqual(names(root, await project.discover()), ['a.tsx', 'a/A.tsx', 'a/Z.tsx']);
});

for (const config of [
  '{"include":["missing/**/*.tsx"]}',
  '{"include":["empty/**/*.tsx"]}',
  '{"include":[]}',
]) {
  test(`configuration with no matching inputs is an empty selection: ${config}`, async (t) => {
    const { root, project } = fixture(t, { 'A.tsx': jsx, 'tsconfig.json': config });
    fs.mkdirSync(path.join(root, 'empty'));
    assert.deepEqual(await project.discover(), []);
  });
}

test('missing extended configuration is reported as invalid configuration', async (t) => {
  const { project } = fixture(t, { 'A.tsx': jsx, 'tsconfig.json': '{"extends":"./missing.json"}' });
  await assert.rejects(project.discover(), /Invalid configuration.*missing.json/);
});

test('compiler options default to an empty object without a configuration', (t) => {
  const { project } = fixture(t);
  assert.deepEqual(project.getCompilerOptions(), {});
});

test('filesystem objects that are neither regular files nor directories are not sources', async (t) => {
  if (process.platform === 'win32') {
    t.skip('POSIX named pipes');
    return;
  }
  const { root, project } = fixture(t, { 'A.tsx': jsx });
  const pipe = path.join(root, 'Pipe.tsx');
  const created = spawnSync('mkfifo', [pipe], { encoding: 'utf8' });
  assert.equal(created.status, 0, created.stderr);
  await assert.rejects(project.discover('Pipe.tsx'), /neither a file nor directory/);
  assert.deepEqual(names(root, await project.discover()), ['A.tsx']);
});

test('ignore matching follows compiler filesystem case sensitivity', async (t) => {
  const { root, project } = fixture(t, { '.gitignore': 'foo.tsx', 'Foo.tsx': jsx });
  const expected = ts.sys.useCaseSensitiveFileNames ? ['Foo.tsx'] : [];
  assert.deepEqual(names(root, await project.discover()), expected);
});

test('extended config symlinks cannot leave the root', async (t) => {
  const { root, parent, project } = fixture(t, {
    'A.tsx': jsx,
    'tsconfig.json': '{"extends":"./base.json"}',
  });
  const outside = path.join(parent, 'outside.json');
  fs.writeFileSync(outside, '{"compilerOptions":{"strict":true}}');
  fs.symlinkSync(outside, path.join(root, 'base.json'));
  await assert.rejects(project.discover(), /outside project root/);
});

test('an empty project with a default config still returns an empty selection', async (t) => {
  const { project } = fixture(t, { 'tsconfig.json': '{}' });
  assert.deepEqual(await project.discover(), []);
});

test('relative extended configs can omit their JSON extension', async (t) => {
  const { root, project } = fixture(t, {
    'tsconfig.json': '{"extends":"./config/base"}',
    'config/base.json': '{"compilerOptions":{"strict":true},"files":["../A.tsx"]}',
    'A.tsx': jsx,
    'B.tsx': jsx,
  });
  assert.deepEqual(names(root, await project.discover()), ['A.tsx']);
  assert.equal(project.getCompilerOptions().strict, true);
});

test('absolute custom configuration accepts a configured root alias', async (t) => {
  const { root, parent } = fixture(t, {
    'custom.json': '{"files":["A.tsx"]}',
    'A.tsx': jsx,
    'B.tsx': jsx,
  });
  const alias = path.join(parent, 'alias');
  fs.symlinkSync(root, alias, 'dir');
  const project = new ProjectWorkspace({ root: alias, tsconfig: path.join(alias, 'custom.json') });
  assert.deepEqual(names(root, await project.discover()), ['A.tsx']);
});
