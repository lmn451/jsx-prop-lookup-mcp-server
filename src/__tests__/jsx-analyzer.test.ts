import { JSXPropAnalyzer } from '../jsx-analyzer';
import { join } from 'path';

describe('JSXPropAnalyzer', () => {
  const testDataPath = join(__dirname, '..', '..', 'test-data');
  let analyzer: JSXPropAnalyzer;

  beforeEach(() => {
    analyzer = new JSXPropAnalyzer();
  });

  it('should analyze props for a simple component correctly', async () => {
    const filePath = join(testDataPath, 'simple-components', 'Button.tsx');
    const result = await analyzer.analyzeProps(filePath);

    expect(result.summary.totalFiles).toBe(1);
    expect(result.summary.totalComponents).toBe(1);
    expect(result.summary.totalProps).toBeGreaterThan(0);

    const buttonComponent = result.components.find(c => c.componentName === 'Button');
    expect(buttonComponent).toBeDefined();
    expect(buttonComponent?.props.map(p => p.propName)).toEqual(
      expect.arrayContaining(['children', 'onClick', 'variant', 'disabled'])
    );
  });

  it('should find prop usage for a specific prop', async () => {
    const directoryPath = join(testDataPath, 'simple-components');
    const propUsages = await analyzer.findPropUsage('onClick', directoryPath, 'Button');

    expect(propUsages.length).toBeGreaterThan(0);
    expect(propUsages[0].propName).toBe('onClick');
    expect(propUsages[0].componentName).toBe('Button');
  });

  it('should get component props for a specific component', async () => {
    const directoryPath = join(testDataPath, 'simple-components');
    const componentAnalysis = await analyzer.getComponentProps('Button', directoryPath);

    expect(componentAnalysis.length).toBe(1);
    expect(componentAnalysis[0].componentName).toBe('Button');
    expect(componentAnalysis[0].props.map(p => p.propName)).toEqual(
      expect.arrayContaining(['children', 'onClick', 'variant', 'disabled'])
    );
  });

  it('should find components without a required prop', async () => {
    const directoryPath = join(testDataPath, 'complex-components');
    const result = await analyzer.findComponentsWithoutProp('Select', 'width', directoryPath);

    expect(result.missingPropUsages.length).toBe(2);
    expect(result.missingPropUsages[0].file).toContain('Select.tsx');
    expect(result.missingPropUsages[0].componentName).toBe('Select');
    expect(result.missingPropUsages[0].existingProps).not.toContain('width');

    expect(result.summary.totalInstances).toBe(2);
    expect(result.summary.missingPropCount).toBe(2);
    expect(result.summary.missingPropPercentage).toBe(100);
  });

  it('should handle files with syntax errors gracefully', async () => {
    const filePath = join(testDataPath, 'problematic-files', 'SyntaxError.jsx');
    // Expect no throw, and analysis result should reflect the skipped file
    const result = await analyzer.analyzeProps(filePath);
    expect(result.summary.totalFiles).toBe(0); // File should be skipped due to parse error
    expect(result.components.length).toBe(0);
    expect(result.propUsages.length).toBe(0);
  });

  it('should handle non-existent paths', async () => {
    const nonExistentPath = join(testDataPath, 'non-existent-dir');
    const result = await analyzer.analyzeProps(nonExistentPath);
    expect(result.summary.totalFiles).toBe(0);
    expect(result.components.length).toBe(0);
    expect(result.propUsages.length).toBe(0);
  });

  it('should handle binary files gracefully', async () => {
    const filePath = join(testDataPath, 'problematic-files', 'BinaryFile.png');
    const result = await analyzer.analyzeProps(filePath);
    expect(result.summary.totalFiles).toBe(0);
    expect(result.components.length).toBe(0);
    expect(result.propUsages.length).toBe(0);
  });
});