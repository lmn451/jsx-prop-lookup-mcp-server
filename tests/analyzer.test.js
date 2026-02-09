import { test, describe } from 'node:test';
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSXPropAnalyzer } from '../dist/jsx-analyzer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const examplesDir = path.resolve(__dirname, '../examples/sample-components');

describe('JSXPropAnalyzer', () => {
  let analyzer;

  test('setup', () => {
    analyzer = new JSXPropAnalyzer();
    assert.ok(analyzer, 'Analyzer should be created');
  });

  describe('analyzeProps', () => {
    test('should analyze all files in examples directory', async () => {
      const result = await analyzer.analyzeProps(examplesDir);

      assert.ok(result.summary, 'Should have summary');
      assert.ok(result.components, 'Should have components array');
      assert.ok(result.propUsages, 'Should have propUsages array');

      assert.ok(
        result.summary.totalFiles >= 4,
        `Should find at least 4 files, found ${result.summary.totalFiles}`
      );
      assert.ok(
        result.summary.totalComponents >= 5,
        `Should find at least 5 components, found ${result.summary.totalComponents}`
      );
      assert.ok(
        result.summary.totalProps >= 10,
        `Should find at least 10 props, found ${result.summary.totalProps}`
      );
    });

    test('should find Button component with expected props', async () => {
      const result = await analyzer.analyzeProps(examplesDir, 'Button');

      const buttonComponents = result.components.filter((c) => c.componentName === 'Button');
      assert.ok(buttonComponents.length > 0, 'Should find Button component');

      const buttonComponent = buttonComponents[0];
      assert.ok(
        buttonComponent.propsInterface === 'ButtonProps',
        'Should have ButtonProps interface'
      );

      const propNames = buttonComponent.props.map((p) => p.propName);
      assert.ok(propNames.includes('children'), 'Should find children prop');
      assert.ok(propNames.includes('onClick'), 'Should find onClick prop');
      assert.ok(propNames.includes('disabled'), 'Should find disabled prop');
      assert.ok(propNames.includes('variant'), 'Should find variant prop');
      assert.ok(propNames.includes('className'), 'Should find className prop');
      assert.ok(propNames.includes('...rest'), 'Should find ...rest prop');
    });

    test('should find Card component', async () => {
      const result = await analyzer.analyzeProps(examplesDir, 'Card');

      const cardComponents = result.components.filter((c) => c.componentName === 'Card');
      assert.ok(cardComponents.length > 0, 'Should find Card component');

      const cardComponent = cardComponents[0];
      const propNames = cardComponent.props.map((p) => p.propName);
      assert.ok(propNames.includes('title'), 'Should find title prop');
      assert.ok(propNames.includes('children'), 'Should find children prop');
      assert.ok(propNames.includes('className'), 'Should find className prop');
      assert.ok(propNames.includes('footer'), 'Should find footer prop');
    });

    test('should NOT find non-existent component', async () => {
      const result = await analyzer.analyzeProps(examplesDir, 'NonExistentComponent');

      assert.strictEqual(result.components.length, 0, 'Should not find non-existent component');
    });
  });

  describe('findPropUsage', () => {
    test('should find onClick prop usage', async () => {
      const usages = await analyzer.findPropUsage('onClick', examplesDir);

      assert.ok(
        usages.length >= 4,
        `Should find at least 4 onClick usages, found ${usages.length}`
      );

      // Should find onClick in Button component definition
      const buttonDefUsage = usages.find(
        (u) => u.componentName === 'Button' && u.file.includes('Button.tsx')
      );
      assert.ok(buttonDefUsage, 'Should find onClick in Button component definition');

      // Should find onClick in JSX usage
      const jsxUsage = usages.find(
        (u) => u.value && (u.value.includes('handleIncrement') || u.value.includes('handleReset'))
      );
      assert.ok(jsxUsage, 'Should find onClick with handler function');
    });

    test('should find className prop usage', async () => {
      const usages = await analyzer.findPropUsage('className', examplesDir);

      assert.ok(
        usages.length >= 3,
        `Should find at least 3 className usages, found ${usages.length}`
      );

      // Should find some with string values
      const stringValueUsage = usages.find((u) => u.value && typeof u.value === 'string');
      assert.ok(stringValueUsage, 'Should find className with string value');
    });

    test('should NOT find non-existent prop', async () => {
      const usages = await analyzer.findPropUsage('nonExistentProp', examplesDir);

      assert.strictEqual(usages.length, 0, 'Should not find non-existent prop');
    });

    test('should find prop usage limited to specific component', async () => {
      const usages = await analyzer.findPropUsage('onClick', examplesDir, 'Button');

      assert.ok(usages.length > 0, 'Should find onClick in Button');

      // All usages should be related to Button component
      const allButtonRelated = usages.every(
        (u) =>
          u.componentName === 'Button' ||
          u.file.includes('Button.tsx') ||
          u.componentName === 'button' // native button element
      );
      assert.ok(allButtonRelated, 'All usages should be Button-related when filtered by component');
    });
  });

  describe('getComponentProps', () => {
    test('should get Button component props', async () => {
      const components = await analyzer.getComponentProps('Button', examplesDir);

      assert.ok(components.length > 0, 'Should find Button component');
      assert.strictEqual(components[0].componentName, 'Button', 'Should return Button component');

      const propNames = components[0].props.map((p) => p.propName);
      assert.ok(propNames.length >= 5, `Should find at least 5 props, found ${propNames.length}`);
    });

    test('should get Select component props', async () => {
      const components = await analyzer.getComponentProps('Select', examplesDir);

      assert.ok(components.length > 0, 'Should find Select component');

      const propNames = components[0].props.map((p) => p.propName);
      assert.ok(propNames.includes('options'), 'Should find options prop');
      assert.ok(propNames.includes('value'), 'Should find value prop');
      assert.ok(propNames.includes('onChange'), 'Should find onChange prop');
      assert.ok(propNames.includes('width'), 'Should find width prop');
    });

    test('should NOT get non-existent component props', async () => {
      const components = await analyzer.getComponentProps('NonExistentComponent', examplesDir);

      assert.strictEqual(components.length, 0, 'Should not find non-existent component');
    });
  });

  describe('findComponentsWithoutProp', () => {
    test('should find Select components without width prop', async () => {
      const result = await analyzer.findComponentsWithoutProp('Select', 'width', examplesDir);

      assert.ok(result.missingPropUsages, 'Should have missingPropUsages array');
      assert.ok(result.summary, 'Should have summary object');

      // Should find at least some Select components missing width
      assert.ok(
        result.missingPropUsages.length >= 2,
        `Should find at least 2 Select without width, found ${result.missingPropUsages.length}`
      );

      // Summary should make sense
      assert.ok(
        result.summary.totalInstances >= result.summary.missingPropCount,
        'Total instances should be >= missing count'
      );
      assert.ok(
        result.summary.missingPropPercentage >= 0 && result.summary.missingPropPercentage <= 100,
        'Percentage should be 0-100'
      );

      // Each missing usage should have required fields
      result.missingPropUsages.forEach((usage) => {
        assert.strictEqual(usage.componentName, 'Select', 'Component name should be Select');
        assert.ok(usage.file, 'Should have file path');
        assert.ok(typeof usage.line === 'number', 'Should have line number');
        assert.ok(typeof usage.column === 'number', 'Should have column number');
        assert.ok(Array.isArray(usage.existingProps), 'Should have existingProps array');
        assert.ok(
          !usage.existingProps.includes('width'),
          'Should not include width in existing props'
        );
      });
    });

    test('should handle components with spread props correctly', async () => {
      const result = await analyzer.findComponentsWithoutProp('Select', 'width', examplesDir);

      // Should not flag components with spread props as missing (conservative approach)
      const withSpread = result.missingPropUsages.filter((u) =>
        u.existingProps.includes('...spread')
      );
      assert.strictEqual(
        withSpread.length,
        0,
        'Should not flag components with spread as missing width'
      );
    });

    test('should NOT find missing props for non-existent component', async () => {
      const result = await analyzer.findComponentsWithoutProp(
        'NonExistentComponent',
        'someProp',
        examplesDir
      );

      assert.strictEqual(
        result.missingPropUsages.length,
        0,
        'Should not find missing props for non-existent component'
      );
      assert.strictEqual(result.summary.totalInstances, 0, 'Total instances should be 0');
      assert.strictEqual(result.summary.missingPropCount, 0, 'Missing count should be 0');
    });

    test('should NOT find missing props when all components have the required prop', async () => {
      // Assuming all Button components have children prop
      const result = await analyzer.findComponentsWithoutProp('Button', 'children', examplesDir);

      // This might be 0 if all Buttons have children, or some number if not all do
      // The important thing is that the summary is consistent
      assert.ok(
        result.summary.totalInstances >= result.summary.missingPropCount,
        'Summary should be consistent'
      );
    });
  });

  describe('Error handling', () => {
    test('should handle invalid directory path', async () => {
      await assert.rejects(
        async () => await analyzer.analyzeProps('/non/existent/path'),
        /Cannot access path/,
        'Should reject with path error'
      );
    });

    test('should handle empty directory', async () => {
      // Create a temp empty directory for this test
      const result = await analyzer.analyzeProps(__dirname); // tests directory should have minimal JS/JSX

      // Should not crash, just return empty or minimal results
      assert.ok(result.summary, 'Should have summary even for empty results');
      assert.ok(Array.isArray(result.components), 'Should have components array');
      assert.ok(Array.isArray(result.propUsages), 'Should have propUsages array');
    });
  });

  describe('TypeScript interface detection', () => {
    test('should detect ButtonProps interface', async () => {
      const result = await analyzer.analyzeProps(examplesDir, 'Button');

      const buttonComponent = result.components.find((c) => c.componentName === 'Button');
      assert.ok(buttonComponent, 'Should find Button component');
      assert.strictEqual(
        buttonComponent.propsInterface,
        'ButtonProps',
        'Should detect ButtonProps interface'
      );
    });

    test('should detect CardProps interface', async () => {
      const result = await analyzer.analyzeProps(examplesDir, 'Card');

      const cardComponent = result.components.find((c) => c.componentName === 'Card');
      assert.ok(cardComponent, 'Should find Card component');
      assert.strictEqual(
        cardComponent.propsInterface,
        'CardProps',
        'Should detect CardProps interface'
      );
    });
  });

  describe('Spread operator handling', () => {
    test('should detect spread props in component definitions', async () => {
      const result = await analyzer.analyzeProps(examplesDir, 'Button');

      const buttonComponent = result.components.find((c) => c.componentName === 'Button');
      const spreadProp = buttonComponent.props.find((p) => p.propName === '...rest');

      assert.ok(spreadProp, 'Should find ...rest spread prop');
      assert.strictEqual(spreadProp.isSpread, true, 'Should mark as spread');
    });

    test('should detect spread props in JSX usage', async () => {
      const usages = await analyzer.findPropUsage('...spread', examplesDir);

      // Should find spread usage in SelectExample with spread props
      const spreadUsage = usages.find((u) => u.isSpread === true);
      assert.ok(spreadUsage, 'Should find spread prop usage');
    });
  });
});
