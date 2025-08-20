
import { describe, it, expect } from 'vitest';
import { JSXPropAnalyzer } from '../src/jsx-analyzer';
import * as path from 'path';

describe('JSXPropAnalyzer', () => {
  const analyzer = new JSXPropAnalyzer();

  it('should analyze Button.tsx correctly', async () => {
    const filePath = path.resolve(__dirname, '../examples/sample-components/Button.tsx');
    const result = await (analyzer as any).analyzeFile(filePath);

    expect(result.components).toHaveLength(1);
    const component = result.components[0];
    expect(component.componentName).toBe('Button');

    const expectedProps = ['children', 'onClick', 'disabled', 'variant', 'className', '...rest'];
    expect(component.props.map((p: any) => p.propName)).toEqual(expect.arrayContaining(expectedProps));
  });

  it('should analyze Card.tsx correctly', async () => {
    const filePath = path.resolve(__dirname, '../examples/sample-components/Card.tsx');
    const result = await (analyzer as any).analyzeFile(filePath);

    expect(result.components).toHaveLength(1);
    const component = result.components[0];
    expect(component.componentName).toBe('Card');

    const expectedProps = ['title', 'children', 'className', 'footer'];
    expect(component.props.map((p: any) => p.propName)).toEqual(expect.arrayContaining(expectedProps));
  });

  it('should analyze SelectExample.tsx correctly', async () => {
    const filePath = path.resolve(__dirname, '../examples/sample-components/SelectExample.tsx');
    const result = await (analyzer as any).analyzeFile(filePath);

    expect(result.components).toHaveLength(2);

    const selectComponent = result.components.find((c: any) => c.componentName === 'Select');
    expect(selectComponent).toBeDefined();
    const selectExpectedProps = ['options', 'value', 'onChange', 'width', 'placeholder', 'disabled'];
    expect(selectComponent.props.map((p: any) => p.propName)).toEqual(expect.arrayContaining(selectExpectedProps));

    const exampleUsageComponent = result.components.find((c: any) => c.componentName === 'ExampleUsage');
    expect(exampleUsageComponent).toBeDefined();
  });

  it('should handle an empty file', async () => {
    const filePath = path.resolve(__dirname, '../examples/sample-components/Empty.tsx');
    const result = await (analyzer as any).analyzeFile(filePath);

    expect(result.components).toHaveLength(0);
    expect(result.propUsages).toHaveLength(0);
  });

  it('should handle a file with no components', async () => {
    const filePath = path.resolve(__dirname, '../examples/sample-components/NoComponents.tsx');
    const result = await (analyzer as any).analyzeFile(filePath);

    expect(result.components).toHaveLength(0);
    expect(result.propUsages).toHaveLength(0);
  });

  it('should handle a component with no props', async () => {
    const filePath = path.resolve(__dirname, '../examples/sample-components/NoPropsComponent.tsx');
    const result = await (analyzer as any).analyzeFile(filePath);

    expect(result.components).toHaveLength(1);
    const component = result.components[0];
    expect(component.componentName).toBe('NoPropsComponent');
    expect(component.props).toHaveLength(0);
  });

  it('should handle a component with inline functions as props', async () => {
    const filePath = path.resolve(__dirname, '../examples/sample-components/InlineFunctionPropsComponent.tsx');
    const result = await (analyzer as any).analyzeFile(filePath);

    expect(result.components).toHaveLength(1);
    const component = result.components[0];
    expect(component.componentName).toBe('InlineFunctionPropsComponent');
    expect(component.props.map((p: any) => p.propName)).toEqual(expect.arrayContaining(['onClick', 'onHover']));
  });

  it('should handle a file with syntax errors gracefully', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const filePath = path.resolve(__dirname, '../tests/error-files/SyntaxError.tsx');
    const result = await (analyzer as any).analyzeFile(filePath);

    expect(result.components).toHaveLength(0);
    expect(result.propUsages).toHaveLength(0);
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});

describe('JSXPropAnalyzer - analyzeProps', () => {
  const analyzer = new JSXPropAnalyzer();

  it('should analyze all files in a directory and return a summary', async () => {
    const dirPath = path.resolve(__dirname, '../examples/sample-components');
    const result = await analyzer.analyzeProps(dirPath);

    expect(result.summary.totalFiles).toBe(8);
    expect(result.summary.totalComponents).toBe(7);
    expect(result.summary.totalProps).toBeGreaterThan(0);
  });
});

describe('JSXPropAnalyzer - findPropUsage', () => {
  const analyzer = new JSXPropAnalyzer();

  it('should find all usages of a specific prop', async () => {
    const dirPath = path.resolve(__dirname, '../examples/sample-components');
    const usages = await analyzer.findPropUsage('onClick', dirPath);

    expect(usages.length).toBeGreaterThan(0);
    expect(usages[0].propName).toBe('onClick');
  });
});

describe('JSXPropAnalyzer - getComponentProps', () => {
  const analyzer = new JSXPropAnalyzer();

  it('should get all props for a specific component', async () => {
    const dirPath = path.resolve(__dirname, '../examples/sample-components');
    const components = await analyzer.getComponentProps('Button', dirPath);

    expect(components.length).toBe(1);
    const component = components[0];
    expect(component.componentName).toBe('Button');
    const expectedProps = ['children', 'onClick', 'disabled', 'variant', 'className', '...rest'];
    expect(component.props.map((p: any) => p.propName)).toEqual(expect.arrayContaining(expectedProps));
  });
});

describe('JSXPropAnalyzer - findComponentsWithoutProp', () => {
  const analyzer = new JSXPropAnalyzer();

  it('should find components without a specific prop', async () => {
    const dirPath = path.resolve(__dirname, '../examples/sample-components');
    const result = await analyzer.findComponentsWithoutProp('Select', 'width', dirPath);

    expect(result.missingPropUsages.length).toBe(2);
    expect(result.summary.missingPropCount).toBe(2);
  });
});
