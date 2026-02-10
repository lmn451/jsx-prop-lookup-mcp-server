import { JSXPropAnalyzer } from './src/jsx-analyzer.js';
import path from 'node:path';

(async () => {
  const analyzer = new JSXPropAnalyzer();
  const dir = path.resolve('./examples/sample-components');

  const all = await analyzer.analyzeProps(dir);
  console.log('Summary:', all.summary);

  const onClickUsages = await analyzer.findPropUsage('onClick', dir);
  console.log('onClick usages count:', onClickUsages.length);
  for (const u of onClickUsages) {
    console.log(
      `${u.file}:${u.line}:${u.column} ${u.componentName}.${u.propName} value=${u.value ?? ''}`
    );
  }
})();
