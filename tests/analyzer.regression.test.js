import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JSXPropAnalyzer } from '../dist/jsx-analyzer.js';

function fixture(t, source) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-analyzer-regression-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'Example.tsx');
  fs.writeFileSync(file, source);
  return { file, directory, analyzer: new JSXPropAnalyzer() };
}

test('counts each attribute once inside nested fragments', async (t) => {
  const { file, analyzer } = fixture(t, 'const view = <><><Button width={100} /></></>;');
  const usages = await analyzer.findPropUsage('width', file, 'Button');
  assert.equal(usages.length, 1);
  assert.equal(usages[0].value, '100');
  assert.equal((await analyzer.analyzeProps(file)).summary.totalProps, 1);
});

test('recognizes JSX children and excludes comment-only or empty elements', async (t) => {
  const { file, analyzer } = fixture(
    t,
    `const view = <>
    <Button>Save</Button>
    <Button><span /></Button>
    <Button>{label}</Button>
    <Button> </Button>
    <Button>{/* no children */}</Button>
    <Button>
    </Button>
    <Button />
  </>;`
  );
  const children = await analyzer.findPropUsage('children', file, 'Button');
  assert.deepEqual(
    children.map((usage) => usage.line),
    [2, 3, 4, 5]
  );
  const missing = await analyzer.findComponentsWithoutProp('Button', 'children', file);
  assert.equal(missing.summary.totalInstances, 7);
  assert.equal(missing.summary.missingPropCount, 3);
  assert.deepEqual(
    missing.missingPropUsages.map((usage) => usage.line),
    [6, 7, 9]
  );
  const widths = await analyzer.findComponentsWithoutProp('Button', 'width', file);
  assert.equal(
    widths.missingPropUsages.filter((u) => u.existingProps.includes('children')).length,
    4
  );
});

for (const definition of [
  'function Button(props) { BODY }',
  'const Button = (props) => { BODY };',
]) {
  test(`respects parameter binding and closure access: ${definition}`, async (t) => {
    const { file, analyzer } = fixture(
      t,
      definition.replace(
        'BODY',
        `
      const handler = () => props.onClick;
      const rows = items.map(props => props.hidden);
      return <div>{props.label}</div>;
    `
      )
    );
    const [component] = await analyzer.getComponentProps('Button', file);
    assert.deepEqual(component.props.map((p) => p.propName).sort(), ['label', 'onClick']);
    assert.deepEqual(await analyzer.findPropUsage('hidden', file, 'Button'), []);
  });
}

test('handles static computed and optional access without inventing dynamic prop names', async (t) => {
  const { file, analyzer } = fixture(
    t,
    `function Button(props) {
    return <div>{props[key]}{props['label']}{props?.title}{props?.['disabled']}</div>;
  }`
  );
  const [component] = await analyzer.getComponentProps('Button', file);
  assert.deepEqual(component.props.map((p) => p.propName).sort(), ['disabled', 'label', 'title']);
});

test('supports defaulted parameters and trailing prop type declarations', async (t) => {
  const { file, analyzer } = fixture(
    t,
    `
    function Button({label}: ButtonProps = {}) { return <span>{label}</span>; }
    interface ButtonProps { label?: string }
    const Card = (props: CardProps = {}) => <div>{props.title}</div>;
    type CardProps = { title?: string };
  `
  );
  const button = (await analyzer.getComponentProps('Button', file))[0];
  const card = (await analyzer.getComponentProps('Card', file))[0];
  assert.equal(button.propsInterface, 'ButtonProps');
  assert.equal(card.propsInterface, 'CardProps');
  assert.deepEqual(
    button.props.map((p) => p.propName),
    ['label']
  );
  assert.deepEqual(
    card.props.map((p) => p.propName),
    ['title']
  );
  const untyped = await analyzer.analyzeProps(file, undefined, undefined, false);
  assert.ok(untyped.components.every((c) => c.propsInterface === undefined));
});

test('all analysis APIs expose parse failures for files and mixed directories', async (t) => {
  const { file, directory, analyzer } = fixture(t, 'const broken = <Button width={');
  fs.writeFileSync(path.join(directory, 'Valid.tsx'), 'const valid = <Button width={10} />;');
  for (const target of [file, directory]) {
    for (const request of [
      () => analyzer.analyzeProps(target),
      () => analyzer.findPropUsage('width', target),
      () => analyzer.getComponentProps('Button', target),
      () => analyzer.findComponentsWithoutProp('Button', 'width', target),
    ]) {
      await assert.rejects(request, /Failed to parse .*Example\.tsx/);
    }
  }
});

test('empty directories return empty results and a zero missing-prop percentage', async (t) => {
  const { file, directory, analyzer } = fixture(t, '');
  fs.unlinkSync(file);
  assert.deepEqual(await analyzer.analyzeProps(directory), {
    summary: { totalFiles: 0, totalComponents: 0, totalProps: 0 },
    components: [],
    propUsages: [],
  });
  assert.deepEqual(await analyzer.findPropUsage('title', directory), []);
  assert.deepEqual(await analyzer.getComponentProps('Button', directory), []);
  assert.deepEqual(await analyzer.findComponentsWithoutProp('Button', 'title', directory), {
    missingPropUsages: [],
    summary: { totalInstances: 0, missingPropCount: 0, missingPropPercentage: 0 },
  });
});

test('directory scans ignore build output, dependencies, and unsupported files', async (t) => {
  const { directory, analyzer } = fixture(t, 'const view = <Button title="source" />;');
  for (const ignored of ['node_modules', 'dist', 'build']) {
    const folder = path.join(directory, ignored);
    fs.mkdirSync(folder);
    fs.writeFileSync(path.join(folder, 'Broken.tsx'), 'this is not valid TypeScript <');
  }
  const unsupported = path.join(directory, 'notes.txt');
  fs.writeFileSync(unsupported, 'not valid code');
  fs.mkdirSync(path.join(directory, 'Directory.tsx'));
  const result = await analyzer.analyzeProps(directory);
  assert.equal(result.summary.totalFiles, 1);
  assert.deepEqual(
    result.propUsages.map((p) => p.value),
    ['source']
  );
  assert.equal((await analyzer.analyzeProps(unsupported)).summary.totalFiles, 0);
});

test('namespaced filters match full and local names while retaining full usage names', async (t) => {
  const { file, analyzer } = fixture(
    t,
    `const view = <>
    <UI.Controls.Select width={10} />
    <Other.Select width={20} />
    <UI.Controls.Button width={30} />
  </>;`
  );
  const full = await analyzer.findPropUsage('width', file, 'UI.Controls.Select');
  assert.deepEqual(
    full.map((p) => [p.componentName, p.value]),
    [['UI.Controls.Select', '10']]
  );
  const local = await analyzer.findPropUsage('width', file, 'Select');
  assert.deepEqual(
    local.map((p) => p.componentName),
    ['UI.Controls.Select', 'Other.Select']
  );
  assert.equal(
    (await analyzer.findComponentsWithoutProp('Select', 'disabled', file)).summary.totalInstances,
    2
  );
});

test('required-prop checks handle explicit attributes, spreads, and absent props exactly', async (t) => {
  const { file, analyzer } = fixture(
    t,
    `const view = <>
    <Button disabled={false} />
    <Button disabled />
    <Button {...props} />
    <Button title="missing" />
  </>;`
  );
  const result = await analyzer.findComponentsWithoutProp('Button', 'disabled', file);
  assert.deepEqual(result.summary, {
    totalInstances: 4,
    missingPropCount: 1,
    missingPropPercentage: 25,
  });
  assert.deepEqual(result.missingPropUsages[0].existingProps, ['title']);
  assert.equal((await analyzer.findPropUsage('...spread', file, 'Button')).length, 1);
});

test('renamed destructured props use the public name and report source locations', async (t) => {
  const { file, analyzer } = fixture(
    t,
    `
function Button({title: label, disabled = false}) { return <span>{label}</span>; }
const usage = <Button title="Hello" />;`
  );
  const [component] = await analyzer.getComponentProps('Button', file);
  assert.deepEqual(
    component.props.map((p) => p.propName),
    ['title', 'disabled']
  );
  const usages = await analyzer.findPropUsage('title', file, 'Button');
  assert.equal(usages.length, 2);
  assert.deepEqual(
    usages.map((p) => p.line),
    [2, 3]
  );
  assert.ok(usages.every((p) => p.file === file && p.column > 0));
  assert.equal(usages[1].value, 'Hello');
  assert.deepEqual(await analyzer.findPropUsage('label', file, 'Button'), []);
});
