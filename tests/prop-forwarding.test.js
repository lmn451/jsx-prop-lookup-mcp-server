import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JSXPropAnalyzer } from '../dist/jsx-analyzer.js';

function fixture(t, source) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-prop-forwarding-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'Example.tsx');
  fs.writeFileSync(file, source);
  return { file, analyzer: new JSXPropAnalyzer() };
}

for (const definition of [
  'function Button(PARAM) { return <button />; }',
  'const Button = (PARAM) => <button />;',
]) {
  test(`recognizes quoted/static keys, not dynamic keys: ${definition}`, async (t) => {
    const { file, analyzer } = fixture(
      t,
      definition.replace(
        'PARAM',
        `{'aria-label': label, ['data-testid']: testId, [dynamic]: value, title: caption = ''}`
      )
    );
    const [component] = await analyzer.getComponentProps('Button', file);
    assert.deepEqual(
      component.props.map((p) => p.propName),
      ['aria-label', 'data-testid', 'title']
    );
    assert.equal((await analyzer.findPropUsage('aria-label', file, 'Button')).length, 1);
    assert.deepEqual(await analyzer.findPropUsage('dynamic', file, 'Button'), []);
  });
}

test('reports rest forwarding separately from named consumed props', async (t) => {
  const { file, analyzer } = fixture(
    t,
    `
    function Button({label, 'aria-label': ariaLabel, ...rest}) {
      return <UI.Button {...rest}>{label}</UI.Button>;
    }
    const Unused = ({label, ...rest}) => <span>{label}</span>;
  `
  );
  const [button] = await analyzer.getComponentProps('Button', file);
  assert.deepEqual(
    button.forwardedProps.map(({ source, targetComponent, excludedProps }) => ({
      source,
      targetComponent,
      excludedProps,
    })),
    [{ source: 'rest', targetComponent: 'UI.Button', excludedProps: ['label', 'aria-label'] }]
  );
  assert.ok(button.forwardedProps.every((p) => p.file === file && p.line > 0 && p.column >= 0));
  const [unused] = await analyzer.getComponentProps('Unused', file);
  assert.deepEqual(unused.forwardedProps ?? [], []);
  assert.equal(button.props.find((p) => p.isSpread).value, 'rest');
});

test('tracks identifier props, body destructuring and renamed rest variables', async (t) => {
  const { file, analyzer } = fixture(
    t,
    `
    const Button = (input) => {
      const {'aria-label': label, disabled = false, ...remaining} = input;
      return <><button {...remaining} /><Other {...input} /></>;
    };
  `
  );
  const [button] = await analyzer.getComponentProps('Button', file);
  assert.deepEqual(
    button.props.filter((p) => !p.isSpread).map((p) => p.propName),
    ['aria-label', 'disabled']
  );
  assert.deepEqual(
    button.forwardedProps.map((p) => [p.source, p.targetComponent, p.excludedProps]),
    [
      ['remaining', 'button', ['aria-label', 'disabled']],
      ['input', 'Other', []],
    ]
  );
});

test('does not mistake shadowed or reassigned rest bindings for forwarded props', async (t) => {
  const { file, analyzer } = fixture(
    t,
    `
    function Button({label, ...rest}) {
      const nested = (rest) => <Fake {...rest} />;
      return <Real {...rest} />;
    }
    function Reassigned(input) {
      input = other;
      return <Fake {...input} />;
    }
    function Shadowed(input) {
      const nested = (input) => { const {...rest} = input; return <Fake {...rest} />; };
      return <span />;
    }
  `
  );
  const [button] = await analyzer.getComponentProps('Button', file);
  assert.deepEqual(
    button.forwardedProps.map((p) => p.targetComponent),
    ['Real']
  );
  for (const name of ['Reassigned', 'Shadowed']) {
    const [component] = await analyzer.getComponentProps(name, file);
    assert.deepEqual(component.forwardedProps ?? [], []);
  }
});

test('marks rest exclusions as unknown when destructuring has a dynamic key', async (t) => {
  const { file, analyzer } = fixture(
    t,
    'const Button = ({[key]: removed, ...rest}) => <button {...rest} />;'
  );
  const [button] = await analyzer.getComponentProps('Button', file);
  assert.equal(button.forwardedProps[0].hasDynamicExclusions, true);
});

test('tracks chained rest exclusions and preserves forwarding with a prop filter', async (t) => {
  const { file, analyzer } = fixture(
    t,
    'function Button({label, ...rest}) { const {disabled, ...remaining} = rest; return <button {...remaining} />; }'
  );
  const result = await analyzer.analyzeProps(file, 'Button', 'label');
  const [component] = result.components;
  assert.deepEqual(
    component.props.filter((p) => !p.isSpread).map((p) => p.propName),
    ['label']
  );
  assert.deepEqual(component.forwardedProps[0].excludedProps, ['label', 'disabled']);
  assert.equal(component.forwardedProps[0].source, 'remaining');
});
test('defaulted arrow parameters and shadowed rest destructuring keep their own bindings', async (t) => {
  const { file, analyzer } = fixture(
    t,
    'const Button = ({label, ...rest} = {}) => { const nested = (rest) => { const {fake} = rest; return <Fake {...rest} />; }; return <button {...rest} />; };'
  );
  const [component] = await analyzer.getComponentProps('Button', file);
  assert.deepEqual(
    component.props.filter((p) => !p.isSpread).map((p) => p.propName),
    ['label']
  );
  assert.deepEqual(
    component.forwardedProps.map((p) => p.targetComponent),
    ['button']
  );
});
