import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSXPropAnalyzer } from '../dist/jsx-analyzer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('analyzeJSXElement value extraction', () => {
  test('stringifies common expression node types', async () => {
    const analyzer = new JSXPropAnalyzer();
    const tmpDir = path.join(__dirname, 'tmp-jsx-values');
    fs.mkdirSync(tmpDir, { recursive: true });

    const filePath = path.join(tmpDir, 'ValueProps.tsx');
    const content = `import React from 'react';
const a = { x: 'X' };
function getName() { return 'n'; }
const handler = (e) => e;
export const Test = () => {
  const id = 'id';
  return (
    <div>
      <Button simple={id} member={a.x} computed={a['x']} call={getName()} fn={() => getName()} tmpl={` + "`hi ${id}`" + `} obj={{a:1}} arr={[1,2]} />
    </div>
  );
};
`;
    fs.writeFileSync(filePath, content, 'utf8');

    try {
      const result = await analyzer.analyzeProps(filePath);
      const usages = result.propUsages.filter((u) => u.componentName === 'Button' || u.file.includes('ValueProps'));

      const byName = (n) => usages.find((u) => u.propName === n);

      assert.strictEqual(byName('simple')?.value, 'id');
      assert.strictEqual(byName('member')?.value, 'a.x');
      assert.strictEqual(byName('computed')?.value, 'a[x]');
      assert.strictEqual(byName('call')?.value, 'getName()');
      assert.strictEqual(byName('fn')?.value, '() => …');
      // Template literal should produce a combined cooked string when possible
      assert.strictEqual(byName('tmpl')?.value, 'hi id');
      assert.strictEqual(byName('obj')?.value, '{...}');
      assert.strictEqual(byName('arr')?.value, '[...]');
    } finally {
      try { fs.unlinkSync(filePath); } catch (_) {}
      try { fs.rmdirSync(tmpDir); } catch (_) {}
    }
  });
});
