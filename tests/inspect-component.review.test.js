import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ProjectWorkspace } from '../dist/project.js';
import { inspectComponent } from '../dist/inspect-component.js';

function fixture(t, source, fileName = 'Widget.tsx') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-inspect-review-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, fileName), source);
  return new ProjectWorkspace({ root });
}

test('nested generic object, callback and array props remain explicitly unresolved', async (t) => {
  const workspace = fixture(
    t,
    `export function Widget<T>(props: {
data: {value:T};
onChange: (value:T) => void;
values: T[];
title: string;
}) {return null;}`
  );
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.complete, false);
  assert.deepEqual(
    result.matches[0].props.map((prop) => prop.name),
    ['data', 'onChange', 'values', 'title']
  );
  assert.equal(result.matches[0].props[3].type, 'string');
  assert.deepEqual(
    result.unresolved
      .filter((item) => item.reason.startsWith('Unresolved type for prop '))
      .map((item) => item.reason.split(':')[0]),
    [
      'Unresolved type for prop data',
      'Unresolved type for prop onChange',
      'Unresolved type for prop values',
    ]
  );
});

test('missing interface bases preserve known props while marking analysis incomplete', async (t) => {
  const workspace = fixture(
    t,
    'interface Props extends Missing {a:string} export function Widget(props:Props) {return null;}'
  );
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.complete, false);
  assert.deepEqual(result.matches[0].props, [{ name: 'a', type: 'string', required: true }]);
  assert.match(result.unresolved[0].reason, /Unresolved props dependency/);
});

test('unresolved aliases nested inside arrays do not become known empty objects', async (t) => {
  const workspace = fixture(
    t,
    'type Alias=Missing; export function Widget(props:{values:Alias[];title:string}) {return null;}'
  );
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.complete, false);
  assert.deepEqual(result.matches[0].props, [
    { name: 'values', type: 'Alias[]', required: true },
    { name: 'title', type: 'string', required: true },
  ]);
  assert.equal(
    result.unresolved.some((item) => item.reason === 'Unresolved type for prop values: Alias[].'),
    true
  );
});

test('whole defaultProps assignments replace earlier keys', async (t) => {
  const workspace = fixture(
    t,
    `export function Widget(props:{a?:number;b?:number}) {return null;}
Widget.defaultProps={a:1};
Widget.defaultProps={b:2};`
  );
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.complete, true);
  assert.deepEqual(result.matches[0].props, [
    { name: 'a', type: 'number', required: false },
    { name: 'b', type: 'number', required: false, default: { status: 'known', value: 2 } },
  ]);
});

test('external defaultProps assignments occur after class static defaults', async (t) => {
  const workspace = fixture(
    t,
    `export class Widget extends Component<{a?:number}> {
static defaultProps={a:1};
}
Widget.defaultProps={a:2};`
  );
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.complete, true);
  assert.deepEqual(result.matches[0].props, [
    { name: 'a', type: 'number', required: false, default: { status: 'known', value: 2 } },
  ]);
});

for (const [object, expected] of [
  ['{a:1,...unknown}', { status: 'unknown', expression: 'unknown' }],
  ['{a:1,...unknown,a:2}', { status: 'known', value: 2 }],
]) {
  test(`defaultProps spread precedence is explicit for ${object}`, async (t) => {
    const workspace = fixture(
      t,
      `export function Widget(props:{a?:number}) {return null;} Widget.defaultProps=${object};`
    );
    const result = await inspectComponent(workspace, { component: 'Widget' });
    assert.equal(result.complete, false);
    assert.deepEqual(result.matches[0].props[0].default, expected);
    assert.match(result.unresolved[0].reason, /Unresolved defaultProps member/);
  });
}

test('getter prop annotations preserve array types', async (t) => {
  const workspace = fixture(
    t,
    'class Props {get values():string[]{return []}} export function Widget(props:Props) {return null;}'
  );
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.complete, true);
  assert.deepEqual(result.matches[0].props, [{ name: 'values', type: 'string[]', required: true }]);
});

test('mapped properties retain their original array declaration', async (t) => {
  const workspace = fixture(
    t,
    'type Clone<T>={[K in keyof T]:T[K]}; export function Widget(props:Clone<{values:string[]}>) {return null;}'
  );
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.complete, true);
  assert.deepEqual(result.matches[0].props, [{ name: 'values', type: 'string[]', required: true }]);
});

test('duplicate prop declarations are incomplete with located prop diagnostics', async (t) => {
  const workspace = fixture(
    t,
    `export function Widget(props:{
title:string;
title:number;
}) {return null;}`
  );
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.complete, false);
  const problem = result.unresolved.find((item) =>
    item.reason.startsWith('Unresolved type for prop title:')
  );
  assert.equal(problem?.line, 2);
  assert.equal(problem?.column, 1);
});

test('multiple ambient declarations identify ambiguity at the first declaration', async (t) => {
  const workspace = fixture(
    t,
    `export declare function Widget(props:{a:string}):unknown;
export declare function Widget(props:{b:number}):unknown;`
  );
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.complete, false);
  assert.equal(result.total, 1);
  assert.equal(result.matches[0].line, 1);
  assert.deepEqual(result.matches[0].props, []);
  assert.match(result.unresolved[0].reason, /Ambiguous overloaded component declaration/);
});

test('known spreads apply in property order and unknown members invalidate earlier defaults', async (t) => {
  const workspace = fixture(
    t,
    `export function Widget(props:{a?:number;b?:number}) {return null;}
Widget.defaultProps={a:1,...{a:2,b:3},b};`
  );
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.complete, false);
  assert.deepEqual(
    result.matches[0].props.map((prop) => prop.default),
    [
      { status: 'known', value: 2 },
      { status: 'unknown', expression: 'b' },
    ]
  );
});

test('an unresolved computed default key can overwrite earlier keys', async (t) => {
  const workspace = fixture(
    t,
    'export function Widget(props:{a?:number}) {return null;} Widget.defaultProps={a:1,[key]:2};'
  );
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.complete, false);
  assert.deepEqual(result.matches[0].props[0].default, { status: 'unknown', expression: '[key]' });
});

test('defaultProps mutations from another module stay explicitly unordered', async (t) => {
  const workspace = fixture(
    t,
    'export function Widget(props:{a?:number}) {return null;} Widget.defaultProps={a:1};'
  );
  fs.writeFileSync(
    path.join(workspace.root, 'other.tsx'),
    "import {Widget} from './Widget'; Widget.defaultProps={a:2};"
  );
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.complete, false);
  assert.deepEqual(result.matches[0].props[0].default, { status: 'unknown', expression: '{a:2}' });
  assert.match(result.unresolved[0].reason, /outside the defining module/);
});

test('recursive known types terminate and nested signature returns retain uncertainty', async (t) => {
  const workspace = fixture(
    t,
    `interface Node {value:string;next?:Node}
export function Widget(props:{node:Node;make:()=>Missing;dictionary:{[key:string]:unknown}}) {return null;}`
  );
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.complete, false);
  assert.deepEqual(
    result.unresolved.map((item) => item.reason.split(':')[0]),
    ['Unresolved type for prop make', 'Unresolved type for prop dictionary']
  );
  assert.equal(result.matches[0].props[0].type, 'Node');
});

test('missing imported aliases inside arrays retain an unresolved dependency', async (t) => {
  const workspace = fixture(
    t,
    "import type {Alias} from './missing'; export function Widget(props:{values:Alias[]}) {return null;}"
  );
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.complete, false);
  assert.deepEqual(result.matches[0].props, [{ name: 'values', type: 'Alias[]', required: true }]);
  assert.equal(
    result.unresolved.some((item) => item.reason === 'Unresolved type for prop values: Alias[].'),
    true
  );
});

test('nested literal default spreads preserve later known keys after unknown spreads', async (t) => {
  const workspace = fixture(
    t,
    `export function Widget(props:{a?:number;b?:number}) {return null;}
Widget.defaultProps={a:1,...{...unknown,a:2,b:3}};`
  );
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.complete, false);
  assert.deepEqual(result.matches[0].props, [
    { name: 'a', type: 'number', required: false, default: { status: 'known', value: 2 } },
    { name: 'b', type: 'number', required: false, default: { status: 'known', value: 3 } },
  ]);
  assert.match(result.unresolved[0].reason, /Unresolved defaultProps member/);
});

test('unknown nested union members keep a prop unresolved', async (t) => {
  const workspace = fixture(
    t,
    'export function Widget(props:{value:string|{nested:unknown}}) {return null;}'
  );
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.complete, false);
  assert.deepEqual(
    result.unresolved.map((item) => item.reason.split(':')[0]),
    ['Unresolved type for prop value']
  );
});

test('conflicting merged declarations retain the prop and mark its type unresolved', async (t) => {
  const workspace = fixture(
    t,
    `interface Props {title:string}
interface Props {title:number}
export function Widget(props:Props) {return null;}`
  );
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.complete, false);
  assert.deepEqual(result.matches[0].props, [{ name: 'title', type: 'string', required: true }]);
  assert.deepEqual(
    result.unresolved.map((item) => item.reason.split(':')[0]),
    ['Unresolved type for prop title']
  );
});

test('diagnostics at the next prop start do not invalidate an adjacent known prop', async (t) => {
  const workspace = fixture(
    t,
    'export function Widget(props:{title:string;bad:string;bad:number}) {return null;}'
  );
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.complete, false);
  assert.deepEqual(
    result.unresolved.map((item) => item.reason.split(':')[0]),
    ['Unresolved type for prop bad']
  );
});

test('parenthesized literal default spreads retain their known properties', async (t) => {
  const workspace = fixture(
    t,
    'export function Widget(props:{a?:number}) {return null;} Widget.defaultProps={a:1,...({a:2})};'
  );
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.complete, true);
  assert.deepEqual(result.matches[0].props, [
    { name: 'a', type: 'number', required: false, default: { status: 'known', value: 2 } },
  ]);
});

for (const expression of ['null', 'false', '2', '"text"', '[2]']) {
  test(`nonobject default spreads remain explicitly unresolved: ${expression}`, async (t) => {
    const workspace = fixture(
      t,
      `export function Widget(props:{a?:number}) {return null;} Widget.defaultProps={a:1,...${expression}};`
    );
    const result = await inspectComponent(workspace, { component: 'Widget' });
    assert.equal(result.complete, false);
    assert.deepEqual(result.matches[0].props, [
      { name: 'a', type: 'number', required: false, default: { status: 'unknown', expression } },
    ]);
  });
}

test('computed default accessors leave earlier defaults explicitly unknown', async (t) => {
  const workspace = fixture(
    t,
    'export function Widget(props:{a?:number}) {return null;} Widget.defaultProps={a:1,get [key](){return 2}};'
  );
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.complete, false);
  assert.deepEqual(result.matches[0].props, [
    {
      name: 'a',
      type: 'number',
      required: false,
      default: { status: 'unknown', expression: 'get [key](){return 2}' },
    },
  ]);
});

test('prototype setters in a default spread do not invent an own prop', async (t) => {
  const workspace = fixture(
    t,
    'export function Widget(props:{a?:number}) {return null;} Widget.defaultProps={a:1,...{__proto__:{a:2}}};'
  );
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.complete, false);
  assert.deepEqual(result.matches[0].props, [
    { name: 'a', type: 'number', required: false, default: { status: 'known', value: 1 } },
  ]);
  assert.match(result.unresolved[0].reason, /Unresolved defaultProps prototype/);
});

for (const brokenImport of [
  "import { Widget as } from './Widget';",
  "import * as '' from './Widget';",
]) {
  test(`malformed aliases preserve known definitions and report parse errors: ${brokenImport}`, async (t) => {
    const workspace = fixture(t, 'export function Widget(props:{title:string}) {return null;}');
    fs.writeFileSync(path.join(workspace.root, 'broken.tsx'), brokenImport);
    const result = await inspectComponent(workspace, { component: 'Widget' });
    assert.equal(result.complete, false);
    assert.equal(result.total, 1);
    assert.deepEqual(result.matches[0].props, [{ name: 'title', type: 'string', required: true }]);
    assert.equal(
      result.unresolved.some((item) => item.reason.startsWith('Parse error:')),
      true
    );
  });
}

for (const [wrapper, expression, expectedDefaults] of [
  ['parentheses', '({...unknown,a:2})', [{ status: 'known', value: 2 }, undefined]],
  [
    'const assertion',
    '({a:2,b:compute()} as const)',
    [
      { status: 'known', value: 2 },
      { status: 'unknown', expression: 'compute()' },
    ],
  ],
  [
    'type assertion',
    '(<{a:number;b:number}>{a:2,b:compute()})',
    [
      { status: 'known', value: 2 },
      { status: 'unknown', expression: 'compute()' },
    ],
  ],
  [
    'satisfies expression',
    '({a:2,b:compute()} satisfies {a:number;b:number})',
    [
      { status: 'known', value: 2 },
      { status: 'unknown', expression: 'compute()' },
    ],
  ],
  [
    'nonnull assertion',
    '({a:2,b:compute()}!)',
    [
      { status: 'known', value: 2 },
      { status: 'unknown', expression: 'compute()' },
    ],
  ],
]) {
  test(`mixed default spreads preserve known keys through ${wrapper}`, async (t) => {
    const workspace = fixture(
      t,
      `export function Widget(props:{a?:number;b?:number}) {return null;}
Widget.defaultProps={a:1,...${expression}};`,
      'Widget.ts'
    );
    const result = await inspectComponent(workspace, { component: 'Widget' });
    assert.equal(result.complete, false);
    assert.deepEqual(
      result.matches[0].props.map((prop) => prop.default),
      expectedDefaults
    );
  });
}

test('synthetic mapped props keep their own types despite a component return annotation', async (t) => {
  const workspace = fixture(
    t,
    'export function Widget(props:{[K in "value"]:any}):string {return "";}'
  );
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.complete, false);
  assert.deepEqual(result.matches[0].props, [{ name: 'value', type: 'any', required: true }]);
});

test('unrelated class static initializers do not taint declared instance prop types', async (t) => {
  const workspace = fixture(
    t,
    `class Broken {static fail=missing;}
class Props {title!:string; static unused=new Broken();}
export function Widget(props:Props) {return null;}`
  );
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.complete, true);
  assert.deepEqual(result.matches[0].props, [{ name: 'title', type: 'string', required: true }]);
});

test('enum initializer execution errors do not taint the declared enum prop type', async (t) => {
  const workspace = fixture(
    t,
    'enum Kind {A=missing()} export function Widget(props:{kind:Kind}) {return null;}'
  );
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.complete, true);
  assert.deepEqual(result.matches[0].props, [{ name: 'kind', type: 'Kind', required: true }]);
});

test('component body errors do not taint known synthetic mapped prop types', async (t) => {
  const workspace = fixture(
    t,
    'export function Widget(props:{[K in "title"]:string}) {missing();return null;}'
  );
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.complete, true);
  assert.deepEqual(result.matches[0].props, [{ name: 'title', type: 'string', required: true }]);
});

test('ambient primitive members do not make a declared primitive prop uncertain', async (t) => {
  const workspace = fixture(
    t,
    'declare global {interface String {extra:unknown}} export function Widget(props:{title:string}) {return null;}'
  );
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.complete, true);
  assert.deepEqual(result.matches[0].props, [{ name: 'title', type: 'string', required: true }]);
});

test('static initializer errors stay outside the instance props contract', async (t) => {
  const workspace = fixture(
    t,
    'class Props {title!:string;static unrelated=missing;} export function Widget(props:Props) {return null;}'
  );
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.complete, true);
  assert.deepEqual(result.matches[0].props, [{ name: 'title', type: 'string', required: true }]);
});

test('missing class bases remain unresolved type dependencies', async (t) => {
  const workspace = fixture(
    t,
    'class Props extends Missing {title!:string;} export function Widget(props:Props) {return null;}'
  );
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.complete, false);
  assert.deepEqual(result.matches[0].props, [{ name: 'title', type: 'string', required: true }]);
  assert.match(result.unresolved[0].reason, /Unresolved props dependency/);
});

for (const [boundary, declaration, annotation] of [
  ['method type constraint', 'class Props {callback<T extends Missing>():void {}}', 'Props'],
  ['method default type', 'class Props {callback<T=Missing>():void {}}', 'Props'],
  ['class type constraint', 'class Props<T extends Missing> {title!:string}', 'Props<string>'],
  ['class default type', 'class Props<T=Missing> {title!:string}', 'Props'],
  [
    'constructor parameter annotation',
    'type Alias=Missing; class Props {constructor(public values:Alias[]) {}}',
    'Props',
  ],
]) {
  test(`nested class props retain unresolved ${boundary} dependencies`, async (t) => {
    const workspace = fixture(
      t,
      `${declaration} export function Widget(props:{nested:${annotation}}) {return null;}`
    );
    const result = await inspectComponent(workspace, { component: 'Widget' });
    assert.equal(result.complete, false);
    assert.deepEqual(
      result.unresolved.map((item) => item.reason.split(':')[0]),
      ['Unresolved type for prop nested']
    );
  });
}

test('missing types on static members stay outside the instance props contract', async (t) => {
  const workspace = fixture(
    t,
    'class Props {title!:string;static unrelated:Missing;} export function Widget(props:Props) {return null;}'
  );
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.complete, true);
  assert.deepEqual(result.matches[0].props, [{ name: 'title', type: 'string', required: true }]);
});

test('nested class array annotations retain missing alias dependencies', async (t) => {
  const workspace = fixture(
    t,
    'type Alias=Missing;class Props {values!:Alias[]} export function Widget(props:{nested:Props}) {return null;}'
  );
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.complete, false);
  assert.deepEqual(
    result.unresolved.map((item) => item.reason.split(':')[0]),
    ['Unresolved type for prop nested']
  );
});

test('nested class method bodies do not taint declared callback signatures', async (t) => {
  const workspace = fixture(
    t,
    'class Props {callback():void {missing();}} export function Widget(props:{nested:Props}) {return null;}'
  );
  const result = await inspectComponent(workspace, { component: 'Widget' });
  assert.equal(result.complete, true);
  assert.deepEqual(result.matches[0].props, [{ name: 'nested', type: 'Props', required: true }]);
});
