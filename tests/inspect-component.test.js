import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ProjectWorkspace } from '../dist/project.js';
import { inspectComponent } from '../dist/inspect-component.js';

function project(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-inspect-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  return new ProjectWorkspace({ root });
}

// Accepted contract: declared props after a component, aliases, literal defaults,
// explicit uncertainty, and stable located results without executing project code.
test('inspects exported definitions without requiring JSX usages and resolves later prop declarations', async (t) => {
  const workspace = project(t, {
    'Widget.tsx': `/** A useful widget. */
export function Widget(props: WidgetProps) { return null; }
type WidgetProps = {
  /** Heading text. */
  title: string;
  count?: number;
  /** @deprecated Use title. */
  old?: string;
};`,
  });
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.complete, true);
  assert.equal(result.total, 1);
  assert.deepEqual(result.unresolved, []);
  const item = result.matches[0];
  assert.equal(item.name, 'Widget');
  assert.equal(item.filePath, path.join(workspace.root, 'Widget.tsx'));
  assert.equal(item.line, 2);
  assert.equal(item.column, 1);
  assert.equal(item.snippet, 'export function Widget(props: WidgetProps) { return null; }');
  assert.equal(item.docs, 'A useful widget.');
  assert.deepEqual(item.props, [
    { name: 'title', type: 'string', required: true, description: 'Heading text.' },
    { name: 'count', type: 'number', required: false },
    { name: 'old', type: 'string', required: false, deprecated: 'Use title.' },
  ]);
});

test('destructured defaults preserve declared requiredness and report static values', async (t) => {
  const workspace = project(t, {
    'Widget.tsx': `export const Widget = ({ count = 2, title: heading = 'Hi' }: {count?: number; title: string}) => null;`,
  });
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.complete, true);
  assert.deepEqual(result.matches[0].props, [
    { name: 'count', type: 'number', required: false, default: { status: 'known', value: 2 } },
    { name: 'title', type: 'string', required: true, default: { status: 'known', value: 'Hi' } },
  ]);
});

test('defaultProps reports each known and unknown default without invoking code', async (t) => {
  const workspace = project(t, {
    'Widget.tsx': `function compute() { throw new Error('must never execute'); }
export function Widget(props: {enabled?: boolean; title?: string}) { return null; }
Widget.defaultProps = { enabled: true, title: compute() };`,
  });
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.deepEqual(result.matches[0].props, [
    {
      name: 'enabled',
      type: 'boolean',
      required: false,
      default: { status: 'known', value: true },
    },
    {
      name: 'title',
      type: 'string',
      required: false,
      default: { status: 'unknown', expression: 'compute()' },
    },
  ]);
  assert.equal(result.complete, false);
  assert.match(result.unresolved[0].reason, /default.*title/i);
});

for (const component of ['Widget', 'Alias', 'Renamed']) {
  test(`resolves ${component} through a barrel to one original definition with a source filter`, async (t) => {
    const workspace = project(t, {
      'widget.tsx': 'export function Widget(props: {title: string}) { return null; }',
      'barrel.ts': "export { Widget as Renamed } from './widget';",
      'other.tsx': 'export function Widget(props: {unrelated: number}) { return null; }',
      'app.tsx':
        "import { Renamed as Alias } from './barrel'; import {Widget} from './other'; const view = <><Alias title='x'/><Widget unrelated={1}/></>;",
    });
    const result = await inspectComponent(workspace, { component, source: './barrel' });
    assert.equal(result.complete, true);
    assert.equal(result.total, 1);
    assert.equal(result.matches[0].name, 'Widget');
    assert.equal(result.matches[0].filePath, path.join(workspace.root, 'widget.tsx'));
    assert.deepEqual(result.matches[0].props, [{ name: 'title', type: 'string', required: true }]);
  });
}

test('reports unknown prop types explicitly instead of claiming no props', async (t) => {
  const workspace = project(t, {
    'Widget.tsx': 'export function Widget(props: MissingProps) { return null; }',
  });
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.total, 1);
  assert.equal(result.complete, false);
  assert.match(result.unresolved[0].reason, /prop.*MissingProps/i);
});

test('reports unsupported wrappers explicitly', async (t) => {
  const workspace = project(t, {
    'Widget.tsx': 'export const Widget = memo(forwardRef((props, ref) => null));',
  });
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.total, 1);
  assert.equal(result.complete, false);
  assert.match(result.unresolved[0].reason, /wrapper/i);
});

test('reads explicit React function component and class prop type arguments', async (t) => {
  const workspace = project(t, {
    'Widget.tsx': `interface Props { title: string }
export const Widget: React.FC<Props> = props => null;
export class Panel extends React.Component<Props> { render() { return null; } }`,
  });
  for (const component of ['Widget', 'Panel']) {
    const result = await inspectComponent(workspace, { component });
    assert.equal(result.complete, true);
    assert.deepEqual(result.matches[0].props, [{ name: 'title', type: 'string', required: true }]);
  }
});

test('keeps same-named definitions and applies shared stable pagination', async (t) => {
  const workspace = project(t, {
    'b.tsx': 'export function Widget() { return null; }',
    'a.tsx': 'export function Widget() { return null; }',
  });
  const first = await inspectComponent(workspace, { component: 'Widget', limit: 1 });
  assert.equal(first.total, 2);
  assert.equal(first.nextOffset, 1);
  assert.equal(first.matches[0].filePath, path.join(workspace.root, 'a.tsx'));
  const second = await inspectComponent(workspace, { component: 'Widget', limit: 1, offset: 1 });
  assert.equal(second.nextOffset, null);
  assert.equal(second.matches[0].filePath, path.join(workspace.root, 'b.tsx'));
});

test('missing components are explicitly unresolved while zero-prop components are complete', async (t) => {
  const workspace = project(t, { 'Widget.tsx': 'export function Widget() { return null; }' });
  const missing = await inspectComponent(workspace, { component: 'Absent' });
  assert.deepEqual(missing.matches, []);
  assert.equal(missing.complete, false);
  assert.match(missing.unresolved[0].reason, /not found/i);
  const found = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(found.complete, true);
  assert.deepEqual(found.matches[0].props, []);
  assert.equal(found.matches[0].docs, undefined);
  await assert.rejects(inspectComponent(workspace, { component: '' }), /non-empty/i);
});

test('rejects a path outside the configured project', async (t) => {
  const workspace = project(t, { 'Widget.tsx': 'export function Widget() { return null; }' });
  await assert.rejects(
    inspectComponent(workspace, { component: 'Widget', path: '..' }),
    /outside project root/
  );
});

test('preserves declared array and unresolved referenced prop types', async (t) => {
  const workspace = project(t, {
    'widget.tsx':
      'export function Widget(props: { tags: string[]; thing: Missing; value: unknown }) { return null; }',
  });
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.deepEqual(result.matches[0].props, [
    { name: 'tags', type: 'string[]', required: true },
    { name: 'thing', type: 'Missing', required: true },
    { name: 'value', type: 'unknown', required: true },
  ]);
  assert.equal(result.complete, false);
  assert.deepEqual(
    result.unresolved.map((item) => item.reason),
    ['Unresolved type for prop thing: Missing.', 'Unresolved type for prop value: unknown.']
  );
});

for (const [component, expectedName] of [
  ['Local', 'Original'],
  ['default', 'Original'],
  ['UI.Widget', 'Widget'],
]) {
  test(`resolves ${component} import identities`, async (t) => {
    const workspace = project(t, {
      'widget.tsx':
        'export default function Original(props: { title: string }) { return null; } export const Widget = (props: { count: number }) => null;',
      'app.tsx': "import Local from './widget'; import * as UI from './widget'; import './side';",
      'side.ts': 'export const unused = 1;',
    });
    const result = await inspectComponent(workspace, {
      component,
      source: './widget',
      path: 'app.tsx',
    });
    assert.equal(result.total, 1);
    assert.equal(result.complete, true);
    assert.equal(result.matches[0].name, expectedName);
  });
}

test('filters by a definition module and an unimported barrel with several exports', async (t) => {
  const workspace = project(t, {
    'widget.tsx': 'export function Widget() { return null; }',
    'barrel.ts': "export {Widget as Renamed} from './widget'; export const unrelated = 1;",
    'other.tsx': 'export function Widget() { return null; }',
  });
  for (const source of ['./widget', './barrel']) {
    const result = await inspectComponent(workspace, { component: 'Widget', source });
    assert.equal(result.total, 1);
    assert.equal(result.matches[0].filePath, path.join(workspace.root, 'widget.tsx'));
  }
  const byExport = await inspectComponent(workspace, { component: 'Renamed', source: './barrel' });
  assert.equal(byExport.total, 1);
  const absent = await inspectComponent(workspace, { component: 'Widget', source: './missing' });
  assert.deepEqual(absent.matches, []);
  assert.equal(absent.unresolved[0].reason, 'Component Widget not found from ./missing.');
});

test('unresolved imports and noncomponent exports cannot masquerade as definitions', async (t) => {
  const workspace = project(t, {
    'app.tsx':
      "import { Missing as Alias } from './missing'; export {other} from './other'; export interface OnlyType {title:string}",
  });
  for (const component of ['Alias', 'OnlyType']) {
    const result = await inspectComponent(workspace, { component });
    assert.equal(result.total, 0);
    assert.equal(result.unresolved[0].reason, `Component ${component} not found.`);
  }
});

test('uses the implementation props when function overloads share a symbol', async (t) => {
  const workspace = project(t, {
    'widget.tsx': `export function Widget(props:{name:string}):null;
export function Widget(props:{count:number}):null;
export function Widget(props:{name?:string;count?:number}) {return null;}`,
  });
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.total, 1);
  assert.equal(result.matches[0].line, 3);
  assert.deepEqual(result.matches[0].props, [
    { name: 'name', type: 'string', required: false },
    { name: 'count', type: 'number', required: false },
  ]);
});

test('scopes defaultProps to its definition and uses destructuring defaults when both exist', async (t) => {
  const workspace = project(t, {
    'a.tsx': `export function Widget({ count = 2 }: {count?:number}) {return null;}
Widget.defaultProps={count:1};
Widget.displayName='widget';`,
    'b.tsx': `export function Widget(props:{count?:number}) {return null;}
Widget.defaultProps={count:9};`,
  });
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.deepEqual(
    result.matches.map((item) => item.props[0].default),
    [
      { status: 'known', value: 2 },
      { status: 'known', value: 9 },
    ]
  );
  assert.equal(result.complete, true);
  assert.deepEqual(
    result.matches.map((item) => item.props.length),
    [1, 1]
  );
});

test('class defaults require the static defaultProps member', async (t) => {
  const workspace = project(t, {
    'widget.tsx': `export class Widget extends PureComponent<{count?:number}> {
public static defaultProps = { count: 2 };
other = {count:3};
defaultProps = {count:4};
render() { return null; }
}`,
  });
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.complete, true);
  assert.deepEqual(result.matches[0].props, [
    { name: 'count', type: 'number', required: false, default: { status: 'known', value: 2 } },
  ]);
});

for (const [declaration, reason] of [
  ['export function Widget(props) {return null;}', 'Unresolved props type: any.'],
  ['export function Widget<T>(props:T) {return null;}', 'Unresolved props type: T.'],
  ['export class Widget {}', 'Unresolved class component props type.'],
  [
    'export class Widget extends Other<{title:string}> {}',
    'Unresolved class component props type.',
  ],
  ['export class Widget extends Component {}', 'Unresolved class component props type.'],
  [
    'export declare const Widget: unknown;',
    'Unresolved component wrapper or value: Widget: unknown',
  ],
]) {
  test(`reports unresolved declaration: ${declaration}`, async (t) => {
    const workspace = project(t, { 'widget.tsx': declaration });
    const result = await inspectComponent(workspace, { component: 'Widget' });
    assert.equal(result.complete, false);
    assert.equal(result.unresolved[0].reason, reason);
  });
}

test('supports unqualified function-component types and function expressions', async (t) => {
  const workspace = project(t, {
    'widget.tsx':
      'export const Widget: FunctionComponent<{title:string}> = function(props) {return null;}',
  });
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.complete, true);
  assert.deepEqual(result.matches[0].props, [{ name: 'title', type: 'string', required: true }]);
});

test('resolves anonymous default function declarations through imported aliases and source filters', async (t) => {
  const workspace = project(t, {
    'card.tsx': `export const Side = () => null;
export default function (props: {title: string}) { return null; }`,
    'barrel.ts': "export { default } from './card';",
    'panel.tsx': 'type Props = {label: string}; export default class extends Component<Props> {}',
    'app.tsx': "import Card from './barrel'; const view = <Card title='x' />;",
  });
  const result = await inspectComponent(workspace, { component: 'Card', source: './barrel' });
  assert.equal(result.total, 1);
  assert.equal(result.complete, true);
  assert.equal(result.matches[0].name, 'default');
  assert.equal(result.matches[0].filePath, path.join(workspace.root, 'card.tsx'));
  assert.deepEqual(result.matches[0].props, [{ name: 'title', type: 'string', required: true }]);
  const panel = await inspectComponent(workspace, { component: 'default', source: './panel' });
  assert.equal(panel.total, 1);
  assert.equal(panel.complete, true);
  assert.equal(panel.matches[0].name, 'default');
  assert.deepEqual(panel.matches[0].props, [{ name: 'label', type: 'string', required: true }]);
});

test('reads props from a declared callable type when its implementation omits the parameter', async (t) => {
  const workspace = project(t, {
    'Widget.tsx':
      'type Props = {title: string}; export const Widget: (props: Props) => unknown = () => null;',
  });
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.total, 1);
  assert.equal(result.complete, true);
  assert.deepEqual(result.matches[0].props, [{ name: 'title', type: 'string', required: true }]);
});

for (const [kind, declaration] of [
  ['alias', 'type Render = (props: {title: string}) => unknown;'],
  ['interface', 'interface Render { (props: {title: string}): unknown; }'],
  ['instantiated alias', 'type Render<T> = (props: {title: T}) => unknown;'],
]) {
  test(`reads declared callable ${kind} props when the implementation omits its parameter`, async (t) => {
    const annotation = kind === 'instantiated alias' ? 'Render<string>' : 'Render';
    const workspace = project(t, {
      'Widget.tsx': `${declaration} export const Widget: ${annotation} = () => null;`,
    });
    const result = await inspectComponent(workspace, { component: 'Widget' });
    assert.equal(result.total, 1);
    assert.equal(result.complete, true);
    assert.deepEqual(result.unresolved, []);
    assert.deepEqual(result.matches[0].props, [{ name: 'title', type: 'string', required: true }]);
  });
}

for (const annotation of ['Render', '() => unknown']) {
  test(`a declared zero-props callable stays complete: ${annotation}`, async (t) => {
    const workspace = project(t, {
      'Widget.tsx': `type Render = () => unknown; export const Widget: ${annotation} = () => null;`,
    });
    const result = await inspectComponent(workspace, { component: 'Widget' });
    assert.equal(result.total, 1);
    assert.equal(result.complete, true);
    assert.deepEqual(result.unresolved, []);
    assert.deepEqual(result.matches[0].props, []);
  });
}

test('ambiguous declared callable signatures stay unresolved when the implementation has no parameter', async (t) => {
  const workspace = project(t, {
    'Widget.tsx': `interface Render {
  (props: {title: string}): unknown;
  (props: {count: number}): unknown;
}
export const Widget: Render = () => null;`,
  });
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.total, 1);
  assert.equal(result.complete, false);
  assert.deepEqual(result.matches[0].props, []);
  assert.match(result.unresolved[0].reason, /callable.*signature/i);
});

test('an unresolved callable annotation cannot imply a known zero-props signature', async (t) => {
  const workspace = project(t, {
    'Widget.tsx': 'export const Widget: MissingRender = () => null;',
  });
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.total, 1);
  assert.equal(result.complete, false);
  assert.deepEqual(result.matches[0].props, []);
  assert.match(result.unresolved[0].reason, /callable.*signature/i);
});

test('infers destructured props and represents an untyped default separately', async (t) => {
  const workspace = project(t, {
    'widget.tsx': `export const Widget = ({ title = 'Hello', count }) => null;
Widget.defaultProps = { other: true };`,
  });
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.deepEqual(result.matches[0].props, [
    {
      name: 'title',
      type: 'string',
      required: false,
      default: { status: 'known', value: 'Hello' },
    },
    { name: 'count', type: 'any', required: true },
    { name: 'other', type: 'unknown', required: false, default: { status: 'known', value: true } },
  ]);
  assert.equal(result.complete, false);
  assert.deepEqual(
    result.unresolved.map((item) => item.reason),
    ['Unresolved type for prop count: any.', 'Default for prop other has no resolved declaration.']
  );
});

for (const [defaults, reason] of [
  ['compute()', 'Unresolved defaultProps: compute()'],
  ['{...values}', 'Unresolved defaultProps member: ...values'],
  ['{ title }', 'Unresolved defaultProps member: title'],
  ['{ [key]: true }', 'Unresolved defaultProps key: [key]'],
]) {
  test(`labels nonliteral defaults: ${defaults}`, async (t) => {
    const workspace = project(t, {
      'widget.tsx': `export function Widget(props:{title?:string}) {return null;} Widget.defaultProps=${defaults};`,
    });
    const result = await inspectComponent(workspace, { component: 'Widget' });
    assert.equal(result.complete, false);
    assert.equal(result.unresolved[0].reason, reason);
  });
}

test('quoted and numeric prop names retain defaults and deprecation without text', async (t) => {
  const workspace = project(t, {
    'widget.tsx': `export function Widget(props: {
/** @deprecated */
old?:string;
'aria-label'?:string;
1?:number
}) {return null;}
Widget.defaultProps={'aria-label':'hello',1:2};`,
  });
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.deepEqual(result.matches[0].props, [
    { name: 'old', type: 'string', required: false, deprecated: true },
    {
      name: 'aria-label',
      type: 'string',
      required: false,
      default: { status: 'known', value: 'hello' },
    },
    { name: '1', type: 'number', required: false, default: { status: 'known', value: 2 } },
  ]);
});

test('retains parse diagnostics and rejects whitespace-only names', async (t) => {
  const workspace = project(t, {
    'widget.tsx': 'export function Widget() {return null;} const broken = <',
  });
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.complete, false);
  assert.match(result.unresolved[0].reason, /Parse error/);
  await assert.rejects(inspectComponent(workspace, { component: '  ' }), /non-empty/);
});

test('marks unresolved nested array element types rather than claiming complete analysis', async (t) => {
  const workspace = project(t, {
    'widget.tsx': 'export function Widget(props: {tags: Missing[]}) {return null;}',
  });
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.deepEqual(result.matches[0].props, [{ name: 'tags', type: 'Missing[]', required: true }]);
  assert.equal(result.complete, false);
  assert.equal(result.unresolved[0].reason, 'Unresolved type for prop tags: Missing[].');
});

test('inspects a local nonexported declaration from a script', async (t) => {
  const workspace = project(t, {
    'widget.tsx': 'function Widget(props: {title: string}) {return null;}',
  });
  const result = await inspectComponent(workspace, { component: 'Widget', source: './widget' });
  assert.equal(result.complete, true);
  assert.deepEqual(result.matches[0].props, [{ name: 'title', type: 'string', required: true }]);
});

test('ignores unrelated assignments and reads plain static class defaults', async (t) => {
  const workspace = project(t, {
    'widget.tsx': `export class Widget extends React.Component<{count?:number}> {
static defaultProps={count:2};
}
const Other = () => null;
Other.defaultProps={foreign:true};
let variable=1; variable=2;`,
  });
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.complete, true);
  assert.deepEqual(result.matches[0].props, [
    { name: 'count', type: 'number', required: false, default: { status: 'known', value: 2 } },
  ]);
});

test('does not mistake similarly named generic types for React component types', async (t) => {
  const workspace = project(t, {
    'widget.tsx': `export const Widget: FCFactory<{title:string}> = props => null;
export class Panel extends ComponentFactory<{title:string}> {}`,
  });
  for (const component of ['Widget', 'Panel']) {
    const result = await inspectComponent(workspace, { component });
    assert.equal(result.complete, false);
    assert.deepEqual(result.matches[0].props, []);
  }
});

test('reports a function component without a props type argument as unresolved', async (t) => {
  const workspace = project(t, { 'widget.tsx': 'export const Widget: FC = props => null;' });
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.complete, false);
  assert.equal(result.unresolved[0].reason, 'Unresolved props type: any.');
});

test('only deprecated documentation tags mark a prop deprecated', async (t) => {
  const workspace = project(t, {
    'widget.tsx': `interface Props {
/** @since initial */
title: string;
onClick(): void;
}
export function Widget(props:Props) {return null;}`,
  });
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.complete, true);
  assert.deepEqual(result.matches[0].props, [
    { name: 'title', type: 'string', required: true },
    { name: 'onClick', type: '() => void', required: true },
  ]);
});

test('uses inferred class property types without requiring an explicit annotation', async (t) => {
  const workspace = project(t, {
    'widget.tsx': `class Props { title = 'initial'; }
export function Widget(props:Props) {return null;}`,
  });
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.complete, true);
  assert.deepEqual(result.matches[0].props, [{ name: 'title', type: 'string', required: true }]);
});

test('resolves a project-relative source from a nested query entrypoint', async (t) => {
  const workspace = project(t, {
    'widget.tsx': 'export function Widget(props:{title:string}) {return null;}',
    'nested/app.tsx': "import {Widget as Local} from '../widget';",
  });
  const result = await inspectComponent(workspace, {
    component: 'Local',
    source: './widget',
    path: 'nested/app.tsx',
  });
  assert.equal(result.total, 1);
  assert.equal(result.matches[0].filePath, path.join(workspace.root, 'widget.tsx'));
});

test('labels union props explicitly rather than returning only shared fields as complete', async (t) => {
  const workspace = project(t, {
    'widget.tsx': `type Props = {kind:'a';title:string} | {kind:'b';count:number};
export function Widget(props:Props) {return null;}`,
  });
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.complete, false);
  assert.deepEqual(result.matches[0].props, []);
  assert.equal(result.unresolved[0].reason, 'Unresolved props type: Props.');
});

test('locates unresolved prop types at their annotation', async (t) => {
  const workspace = project(t, {
    'widget.tsx': `export function Widget(
  props: MissingProps
) { return null; }`,
  });
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.unresolved[0].line, 2);
  assert.equal(result.unresolved[0].column, 10);
  assert.equal(result.unresolved[0].filePath, path.join(workspace.root, 'widget.tsx'));
});

test('labels computed destructured default keys as unresolved', async (t) => {
  const workspace = project(t, {
    'widget.tsx': 'export function Widget({[key]: value = 2}: {title:string}) {return null;}',
  });
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.complete, false);
  assert.equal(result.unresolved[0].reason, 'Unresolved destructured default key: [key]');
  assert.deepEqual(result.matches[0].props, [{ name: 'title', type: 'string', required: true }]);
});

test('class implements clauses do not supply React props', async (t) => {
  const workspace = project(t, {
    'widget.tsx': 'export class Widget implements Component<{title:string}> {}',
  });
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.complete, false);
  assert.equal(result.unresolved[0].reason, 'Unresolved class component props type.');
  assert.deepEqual(result.matches[0].props, []);
});

test('only static defaultProps contributes class defaults', async (t) => {
  const workspace = project(t, {
    'widget.tsx': `export class Widget extends Component<{title:string}> {
static other={title:'other'};
}`,
  });
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.complete, true);
  assert.deepEqual(result.matches[0].props, [{ name: 'title', type: 'string', required: true }]);
});

test('conditional defaultProps assignments stay unknown even when each value is literal', async (t) => {
  const workspace = project(t, {
    'widget.tsx': `export function Widget(props:{title?:string}) {return null;}
if (enabled) Widget.defaultProps={title:'one'}; else Widget.defaultProps={title:'two'};`,
  });
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.complete, false);
  assert.deepEqual(result.matches[0].props, [{ name: 'title', type: 'string', required: false }]);
  assert.deepEqual(
    result.unresolved.map((item) => item.reason),
    [
      'Conditional or nested defaultProps assignment cannot be resolved statically.',
      'Conditional or nested defaultProps assignment cannot be resolved statically.',
    ]
  );
});

test('public instance defaults are excluded and comparisons do not assign defaults', async (t) => {
  const workspace = project(t, {
    'widget.tsx': `export class Widget extends Component<{title:string}> {
public defaultProps={title:'instance'};
}
Widget.defaultProps === {title:'comparison'};`,
  });
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.complete, true);
  assert.deepEqual(result.matches[0].props, [{ name: 'title', type: 'string', required: true }]);
});

test('inspects a declared component without an implementation body', async (t) => {
  const workspace = project(t, {
    'widget.d.ts': 'export declare function Widget(props:{title:string}): unknown;',
  });
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.complete, true);
  assert.equal(result.total, 1);
  assert.deepEqual(result.matches[0].props, [{ name: 'title', type: 'string', required: true }]);
});

test('resolves generic substitutions and intersected prop types', async (t) => {
  const workspace = project(t, {
    'widget.tsx': `type Props<T> = {value:T};
export function Widget(props:Props<string>) {return null;}
export function List(props:Props<string[]>) {return null;}
type Both = {value:string} & {value:number};
export function Panel(props:Both) {return null;}`,
  });
  const widget = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(widget.complete, true);
  assert.deepEqual(widget.matches[0].props, [{ name: 'value', type: 'string', required: true }]);
  const panel = await inspectComponent(workspace, { component: 'Panel' });
  assert.equal(panel.complete, true);
  assert.deepEqual(panel.matches[0].props, [{ name: 'value', type: 'never', required: true }]);
  const list = await inspectComponent(workspace, { component: 'List' });
  assert.equal(list.complete, false);
  assert.deepEqual(list.matches[0].props, [{ name: 'value', type: 'T', required: true }]);
  assert.equal(list.unresolved[0].reason, 'Unresolved type for prop value: T.');
});
