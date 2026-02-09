import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as t from '@babel/types';
import { JSXPropAnalyzer } from '../dist/jsx-analyzer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('getJSXName and complex JSX expressions', () => {
  test('getJSXName handles identifiers and member expressions', () => {
    const analyzer = new JSXPropAnalyzer();

    // Access private method at runtime
    // Identifier
    const ident = t.jsxIdentifier('Button');
    const res1 = analyzer['getJSXName'](ident);
    assert.deepStrictEqual(res1, { full: 'Button', local: 'Button' });

    // Simple member expression: UI.Select
    const member = t.jsxMemberExpression(t.jsxIdentifier('UI'), t.jsxIdentifier('Select'));
    const res2 = analyzer['getJSXName'](member);
    assert.deepStrictEqual(res2, { full: 'UI.Select', local: 'Select' });

    // Deep member expression: A.B.C.D
    const deep = t.jsxMemberExpression(
      t.jsxMemberExpression(t.jsxMemberExpression(t.jsxIdentifier('A'), t.jsxIdentifier('B')), t.jsxIdentifier('C')),
      t.jsxIdentifier('D')
    );
    const res3 = analyzer['getJSXName'](deep);
    assert.deepStrictEqual(res3, { full: 'A.B.C.D', local: 'D' });
  });

  test('analyzer handles complex JSX expression attribute values without crashing', async () => {
    const analyzer = new JSXPropAnalyzer();
    const tmpDir = path.join(__dirname, 'tmp-jsx-tests');
    fs.mkdirSync(tmpDir, { recursive: true });

    const filePath = path.join(tmpDir, 'ComplexProps.tsx');
    const content = `import React from 'react';
export const Foo = () => {
  const obj = { x: 1 };
  const handler = () => {};
  return (
    <div>
      <Button onClick={handler} data={obj.x} computed={obj['x']} call={obj.get && obj.get()} fn={() => handler()} />
    </div>
  );
};
`;
    fs.writeFileSync(filePath, content, 'utf8');

    try {
      const result = await analyzer.analyzeProps(filePath);
      // Ensure we got prop usages and no crash
      assert.ok(result.propUsages, 'Should return propUsages');
      const usages = result.propUsages.filter((u) => u.componentName === 'Button' || u.file.includes('ComplexProps'));
      // We expect at least several prop usages for Button
      assert.ok(usages.length >= 1, 'Should find prop usages for Button');
      // Values for complex expressions may be undefined but must not throw
      usages.forEach((u) => {
        assert.ok('propName' in u, 'Usage should have propName');
      });
    } finally {
      try { fs.unlinkSync(filePath); } catch (_) {}
      try { fs.rmdirSync(tmpDir); } catch (_) {}
    }
  });
});
