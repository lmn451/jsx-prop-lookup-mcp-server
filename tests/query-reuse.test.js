import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { ProjectWorkspace } from '../dist/project.js';
import { createJsxSnapshot, collectJsx } from '../dist/jsx-query.js';
import { collectJsxWithSwc } from '../dist/swc-discovery.js';
import { findJsx } from '../dist/find-jsx.js';
import { inspectComponent } from '../dist/inspect-component.js';

function fixture(t, files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-query-reuse-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [name, text] of Object.entries(files)) {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
  return new ProjectWorkspace({ root });
}

const app = "import {Button as B} from './ui'; const view = <B label='old' />;";
const ui = 'export function Button(props: {label: string}) {return null;}';

test('unchanged queries reuse syntax, not Programs or semantic results', async (t) => {
  const project = fixture(t, { 'app.tsx': app, 'ui.tsx': ui });
  const first = await createJsxSnapshot(project, 'app.tsx');
  const second = await createJsxSnapshot(project, 'app.tsx');
  assert.notEqual(second.program, first.program);
  assert.equal(second.files[0], first.files[0]);
  assert.notEqual(second.checker, first.checker);
  assert.deepEqual(collectJsx(second), collectJsx(first));
});

test('unchanged repeated queries perform zero additional TypeScript parses', async (t) => {
  const project = fixture(t, { 'app.tsx': app, 'ui.tsx': ui });
  ts.performance.enable();
  const before = ts.performance.getCount('beforeParse');
  await findJsx(project, { discovery: 'swc' });
  const cold = ts.performance.getCount('beforeParse');
  assert.ok(cold > before);
  await findJsx(project, { discovery: 'swc' });
  assert.equal(ts.performance.getCount('beforeParse'), cold);
  ts.performance.disable();
});

test('native JSX discovery is reused without caching projected matches', async (t) => {
  const project = fixture(t, { 'app.tsx': app, 'ui.tsx': ui });
  const first = await createJsxSnapshot(project);
  const initial = collectJsxWithSwc(first);
  assert.equal(initial.parsedFiles, 2);
  assert.equal(initial.reusedFiles, 0);
  initial.matches[0].props.label = { status: 'known', value: 'tampered' };
  const next = collectJsxWithSwc(await createJsxSnapshot(project));
  assert.equal(next.parsedFiles, 0);
  assert.equal(next.reusedFiles, 2);
  assert.equal(next.matches[0].props.label.value, 'old');
});

test('same-size edits with restored timestamps invalidate syntax and native discovery', async (t) => {
  const project = fixture(t, { 'app.tsx': app, 'ui.tsx': ui });
  const first = await createJsxSnapshot(project);
  collectJsxWithSwc(first);
  const file = path.join(project.root, 'app.tsx');
  const info = fs.statSync(file);
  fs.writeFileSync(file, app.replace('old', 'new'));
  fs.utimesSync(file, info.atime, info.mtime);
  const second = await createJsxSnapshot(project);
  assert.notEqual(second.files[0], first.files[0]);
  const next = collectJsxWithSwc(second);
  assert.equal(next.parsedFiles, 1);
  assert.equal(next.reusedFiles, 1);
  assert.equal(next.matches[0].props.label.value, 'new');
  assert.equal(collectJsxWithSwc(first).matches[0].props.label.value, 'old');
});

test('unchanged callers resolve newly created and deleted modules afresh', async (t) => {
  const project = fixture(t, { 'app.tsx': app });
  const query = { path: 'app.tsx', component: 'Button', discovery: 'swc' };
  assert.equal((await findJsx(project, query)).complete, false);
  fs.writeFileSync(path.join(project.root, 'ui.tsx'), ui);
  const resolved = await findJsx(project, query);
  assert.equal(resolved.complete, true);
  assert.equal(resolved.total, 1);
  fs.unlinkSync(path.join(project.root, 'ui.tsx'));
  const missing = await findJsx(project, query);
  assert.equal(missing.complete, false);
  assert.equal(missing.matches[0].identity.definition, undefined);
});

test('cached caller nodes follow changed re-export definitions and imported prop types', async (t) => {
  const project = fixture(t, {
    'app.tsx': "import {Button as B} from './barrel'; const view = <B label='old' />;",
    'barrel.ts': "export {Button} from './one';",
    'one.tsx': ui,
    'two.tsx': 'export function Button(props: {other: number}) {return null;}',
  });
  const query = { path: 'app.tsx', component: 'Button', discovery: 'swc' };
  assert.equal(
    path.basename((await findJsx(project, query)).matches[0].identity.definition.filePath),
    'one.tsx'
  );
  fs.writeFileSync(path.join(project.root, 'barrel.ts'), "export {Button} from './two';");
  assert.equal(
    path.basename((await findJsx(project, query)).matches[0].identity.definition.filePath),
    'two.tsx'
  );
  const props = await inspectComponent(project, { component: 'Button', source: './two' });
  assert.deepEqual(
    props.matches[0].props.map((prop) => prop.name),
    ['other']
  );
  fs.writeFileSync(
    path.join(project.root, 'two.tsx'),
    'export function Button(props: {fresh: boolean}) {return null;}'
  );
  assert.deepEqual(
    (
      await inspectComponent(project, { component: 'Button', source: './two' })
    ).matches[0].props.map((prop) => prop.name),
    ['fresh']
  );
});

test('configuration and ignore-rule edits are observed on every query', async (t) => {
  const project = fixture(t, {
    'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2020' }, include: ['*.tsx'] }),
    'app.tsx': '<Button />;',
    'other.tsx': '<Other />;',
  });
  const first = await createJsxSnapshot(project);
  assert.equal(first.files[0].languageVersion, ts.ScriptTarget.ES2020);
  fs.writeFileSync(
    path.join(project.root, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { target: 'ES2022' }, include: ['app.tsx'] })
  );
  const second = await createJsxSnapshot(project);
  assert.equal(second.files.length, 1);
  assert.equal(second.files[0].languageVersion, ts.ScriptTarget.ES2022);
  assert.notEqual(first.files[0], second.files[0]);
  fs.writeFileSync(path.join(project.root, '.gitignore'), 'app.tsx\n');
  assert.equal((await findJsx(project, { discovery: 'swc' })).total, 0);
});

test('warm queries still read and validate source contents', async (t) => {
  const project = fixture(t, { 'app.tsx': app, 'ui.tsx': ui });
  const reads = [];
  class ObservedWorkspace extends ProjectWorkspace {
    readFile(input) {
      reads.push(path.basename(input));
      return super.readFile(input);
    }
  }
  const observed = new ObservedWorkspace({ root: project.root });
  await findJsx(observed, { path: 'app.tsx', discovery: 'swc' });
  reads.length = 0;
  await findJsx(observed, { path: 'app.tsx', discovery: 'swc' });
  assert.ok(reads.includes('app.tsx'));
  assert.ok(reads.includes('ui.tsx'));
});

test('a warm import cannot escape through a swapped symlink', async (t) => {
  const project = fixture(t, { 'app.tsx': app, 'inside.tsx': ui });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-reuse-private-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const link = path.join(project.root, 'ui.tsx');
  fs.symlinkSync(path.join(project.root, 'inside.tsx'), link);
  const query = { path: 'app.tsx', discovery: 'swc' };
  assert.equal((await findJsx(project, query)).complete, true);
  const outside = path.join(directory, 'private.tsx');
  fs.writeFileSync(outside, 'export const Button = () => <Private secret="never-cache-this" />;');
  fs.unlinkSync(link);
  fs.symlinkSync(outside, link);
  await assert.rejects(findJsx(project, query), /outside project root/);
  await assert.rejects(
    findJsx(project, { ...query, discovery: 'typescript' }),
    /outside project root/
  );
});

test('package module-format edits invalidate matching-text syntax', async (t) => {
  const project = fixture(t, {
    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        moduleDetection: 'auto',
        allowJs: true,
      },
    }),
    'package.json': JSON.stringify({ type: 'commonjs' }),
    'app.js': 'const view = <Button />;',
  });
  const first = await createJsxSnapshot(project);
  fs.writeFileSync(path.join(project.root, 'package.json'), JSON.stringify({ type: 'module' }));
  const second = await createJsxSnapshot(project);
  assert.notEqual(first.files[0].impliedNodeFormat, second.files[0].impliedNodeFormat);
  assert.notEqual(first.files[0], second.files[0]);
  assert.equal(second.files[0].text, first.files[0].text);
});

test('parse diagnostics and fallback discovery remain fresh across edits', async (t) => {
  const project = fixture(t, { 'app.tsx': 'const view = <Button />;' });
  assert.equal((await findJsx(project, { discovery: 'swc' })).complete, true);
  fs.writeFileSync(path.join(project.root, 'app.tsx'), 'const view = <Button label={;');
  const malformed = await findJsx(project, { discovery: 'swc' });
  assert.equal(malformed.complete, false);
  assert.deepEqual(malformed, await findJsx(project));
  const cached = collectJsxWithSwc(await createJsxSnapshot(project));
  assert.equal(cached.reusedFiles, 1);
  assert.equal(cached.parsedFiles, 0);
  assert.equal(cached.fallbackFiles.length, 1);
  fs.writeFileSync(path.join(project.root, 'app.tsx'), 'const view = <Button />;');
  assert.equal((await findJsx(project, { discovery: 'swc' })).complete, true);
});

test('cached import bindings cannot retain an escaped discovery-excluded dependency', async (t) => {
  const project = fixture(t, {
    'app.tsx': "import {Button as B} from 'private-ui'; const view = <B />;",
    'inside.tsx': ui,
  });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-reuse-outside-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const dependency = path.join(project.root, 'node_modules', 'private-ui');
  fs.mkdirSync(dependency, { recursive: true });
  const link = path.join(dependency, 'index.tsx');
  fs.symlinkSync(path.join(project.root, 'inside.tsx'), link);
  const query = { path: 'app.tsx', discovery: 'swc' };
  assert.equal((await findJsx(project, query)).complete, true);
  const outside = path.join(directory, 'private.tsx');
  fs.writeFileSync(outside, 'export const Button = () => <Private secret="do-not-leak" />;');
  fs.unlinkSync(link);
  fs.symlinkSync(outside, link);
  const result = await findJsx(project, query);
  assert.equal(result.complete, false);
  assert.equal(result.matches[0].identity.definition, undefined);
  assert.equal(JSON.stringify(result).includes('do-not-leak'), false);
});

test('unchanged NodeNext module context can reuse syntax', async (t) => {
  const project = fixture(t, {
    'tsconfig.json': JSON.stringify({
      compilerOptions: { module: 'NodeNext', moduleResolution: 'NodeNext', allowJs: true },
    }),
    'package.json': JSON.stringify({ type: 'module' }),
    'app.js': 'export const view = <Button />;',
  });
  const first = await createJsxSnapshot(project);
  const second = await createJsxSnapshot(project);
  assert.equal(second.files[0], first.files[0]);
  assert.deepEqual(collectJsx(second), collectJsx(first));
});
