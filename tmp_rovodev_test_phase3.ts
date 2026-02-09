import { JSXPropAnalyzer } from './src/jsx-analyzer.js';
import path from 'node:path';

(async () => {
  const analyzer = new JSXPropAnalyzer();
  const dir = path.resolve('./examples/sample-components');

  console.log('Testing TSTypeAliasDeclaration mapping to props interface...');
  const comps = await analyzer.getComponentProps('ArrowWithIdentifier', dir);
  console.log('Component entries:', comps.length);
  console.log('Props interface for ArrowWithIdentifier:', comps[0]?.propsInterface ?? '(none)');

  console.log('\nTesting namespaced JSX (UI.Select) with missing width detection...');
  const missing = await analyzer.findComponentsWithoutProp('Select', 'width', dir);
  console.log('Missing summary:', missing.summary);
  for (const m of missing.missingPropUsages) {
    console.log(
      `Missing width: ${m.file}:${m.line}:${m.column} existing=[${m.existingProps.join(', ')}]`
    );
  }

  console.log('\nTesting namespaced JSX matching with full name...');
  const missingFull = await analyzer.findComponentsWithoutProp('UI.Select', 'width', dir);
  console.log('Missing summary (full):', missingFull.summary);
  for (const m of missingFull.missingPropUsages) {
    console.log(
      `Missing width (full): ${m.file}:${m.line}:${m.column} existing=[${m.existingProps.join(', ')}]`
    );
  }
})();
