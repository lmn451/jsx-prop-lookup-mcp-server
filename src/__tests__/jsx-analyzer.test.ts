import { JSXPropAnalyzer, AnalysisResult } from '../jsx-analyzer';
import { join } from 'path';

describe('JSXPropAnalyzer', () => {
  const testDataPath = join(__dirname, '..', '..', 'test-data');
  let analyzer: JSXPropAnalyzer;

  beforeEach(() => {
    analyzer = new JSXPropAnalyzer();
  });

  it('should analyze props for a simple component correctly', async () => {
    const filePath = join(testDataPath, 'simple-components', 'Button.tsx');
    const result = await analyzer.analyzeProps(filePath, undefined, undefined, true, { format: 'full' }) as AnalysisResult;

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
    const propUsages = await analyzer.findPropUsage('onClick', directoryPath, 'Button', { format: 'full' });

    expect(propUsages.length).toBeGreaterThan(0);
    expect((propUsages[0] as any).propName).toBe('onClick');
    expect((propUsages[0] as any).componentName).toBe('Button');
  });

  it('should get component props for a specific component', async () => {
    const directoryPath = join(testDataPath, 'simple-components');
    const componentAnalysis = await analyzer.getComponentProps('Button', directoryPath, { format: 'full' });

    expect(componentAnalysis.length).toBe(1);
    expect((componentAnalysis[0] as any).componentName).toBe('Button');
    expect((componentAnalysis[0] as any).props.map((p: any) => p.propName)).toEqual(
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
    const result = await analyzer.analyzeProps(filePath, undefined, undefined, true, { format: 'full' }) as AnalysisResult;
    expect(result.summary.totalFiles).toBe(0); // File should be skipped due to parse error
    expect(result.components.length).toBe(0);
    expect(result.propUsages.length).toBe(0);
  });

  it('should handle non-existent paths', async () => {
    const nonExistentPath = join(testDataPath, 'non-existent-dir');
    const result = await analyzer.analyzeProps(nonExistentPath, undefined, undefined, true, { format: 'full' }) as AnalysisResult;
    expect(result.summary.totalFiles).toBe(0);
    expect(result.components.length).toBe(0);
    expect(result.propUsages.length).toBe(0);
  });

  it('should handle binary files gracefully', async () => {
    const filePath = join(testDataPath, 'problematic-files', 'BinaryFile.png');
    const result = await analyzer.analyzeProps(filePath, undefined, undefined, true, { format: 'full' }) as AnalysisResult;
    expect(result.summary.totalFiles).toBe(0);
    expect(result.components.length).toBe(0);
    expect(result.propUsages.length).toBe(0);
  });

  it('should handle current directory "." as a valid path', async () => {
    const result = await analyzer.analyzeProps('.', undefined, undefined, true, { format: 'full' }) as AnalysisResult;
    // Should not throw an error and should return a valid result structure
    expect(result).toBeDefined();
    expect(result.summary).toBeDefined();
    expect(result.components).toBeDefined();
    expect(result.propUsages).toBeDefined();
    expect(typeof result.summary.totalFiles).toBe('number');
    expect(typeof result.summary.totalComponents).toBe('number');
    expect(typeof result.summary.totalProps).toBe('number');
    expect(Array.isArray(result.components)).toBe(true);
    expect(Array.isArray(result.propUsages)).toBe(true);
  });

  // New tests for response formats
  describe('Response Format Tests', () => {
    it('should return compact format correctly', async () => {
      const filePath = join(testDataPath, 'simple-components', 'Button.tsx');
      const result = await analyzer.analyzeProps(filePath, undefined, undefined, true, { format: 'compact' });
      
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('files');
      expect((result as any).summary).toHaveProperty('files');
      expect((result as any).summary).toHaveProperty('components');
      expect((result as any).summary).toHaveProperty('props');
      expect(typeof (result as any).files).toBe('object');
    });

    it('should return minimal format correctly', async () => {
      const filePath = join(testDataPath, 'simple-components', 'Button.tsx');
      const result = await analyzer.analyzeProps(filePath, undefined, undefined, true, { format: 'minimal' });
      
      expect(result).toHaveProperty('props');
      expect(typeof (result as any).props).toBe('object');
      
      // Check that props are grouped correctly
      const props = (result as any).props;
      Object.keys(props).forEach(propName => {
        expect(Array.isArray(props[propName])).toBe(true);
        if (props[propName].length > 0) {
          expect(props[propName][0]).toHaveProperty('component');
          expect(props[propName][0]).toHaveProperty('file');
          expect(props[propName][0]).toHaveProperty('line');
        }
      });
    });

    it('should include prettyPath when requested', async () => {
      const filePath = join(testDataPath, 'simple-components', 'Button.tsx');
      const result = await analyzer.analyzeProps(filePath, undefined, undefined, true, { 
        format: 'full', 
        includePrettyPaths: true 
      }) as AnalysisResult;
      
      if (result.components.length > 0) {
        expect(result.components[0]).toHaveProperty('prettyPath');
        expect(typeof result.components[0].prettyPath).toBe('string');
      }
      
      if (result.propUsages.length > 0) {
        expect(result.propUsages[0]).toHaveProperty('prettyPath');
        expect(typeof result.propUsages[0].prettyPath).toBe('string');
        expect(result.propUsages[0].prettyPath).toContain(':');
      }
    });

    it('should exclude columns when requested', async () => {
      const filePath = join(testDataPath, 'simple-components', 'Button.tsx');
      const result = await analyzer.analyzeProps(filePath, undefined, undefined, true, { 
        format: 'compact', 
        includeColumns: false 
      });
      
      const files = (result as any).files;
      Object.values(files).forEach((fileData: any) => {
        fileData.usages.forEach((usage: any) => {
          expect(usage).not.toHaveProperty('col');
        });
      });
    });

    it('should work with findPropUsage in different formats', async () => {
      const directoryPath = join(testDataPath, 'simple-components');
      
      // Test minimal format
      const minimalResult = await analyzer.findPropUsage('onClick', directoryPath, undefined, { format: 'minimal' });
      expect(Array.isArray(minimalResult)).toBe(true);
      if (minimalResult.length > 0) {
        expect((minimalResult[0] as any)).toHaveProperty('component');
        expect((minimalResult[0] as any)).toHaveProperty('file');
        expect((minimalResult[0] as any)).toHaveProperty('line');
      }
    });

    it('should work with getComponentProps in different formats', async () => {
      const directoryPath = join(testDataPath, 'simple-components');
      
      // Test compact format
      const compactResult = await analyzer.getComponentProps('Button', directoryPath, { format: 'compact' });
      expect(Array.isArray(compactResult)).toBe(true);
      if (compactResult.length > 0) {
        expect((compactResult[0] as any)).toHaveProperty('name');
        expect((compactResult[0] as any)).toHaveProperty('props');
        expect(Array.isArray((compactResult[0] as any).props)).toBe(true);
      }
    });
  });

  // New tests for query_components functionality
  describe('Query Components Tests', () => {
    it('should query components with equals operator', async () => {
      const directoryPath = join(testDataPath, 'simple-components');
      const result = await analyzer.queryComponents('Button', [
        { name: 'variant', value: 'primary', operator: 'equals' }
      ], { directory: directoryPath });
      
      expect(result).toHaveProperty('results');
      expect(Array.isArray(result.results)).toBe(true);
      expect(result).toHaveProperty('summary');
      if (result.results.length > 0) {
        expect(result.results[0]).toHaveProperty('componentName', 'Button');
        expect(result.results[0]).toHaveProperty('matchingProps');
        expect(Object.keys(result.results[0].matchingProps)).toContain('variant');
      }
    });

    it('should query components with contains operator', async () => {
      const directoryPath = join(testDataPath, 'simple-components');
      const result = await analyzer.queryComponents('Button', [
        { name: 'children', value: 'Click', operator: 'contains' }
      ], { directory: directoryPath });
      
      expect(result).toHaveProperty('results');
      expect(Array.isArray(result.results)).toBe(true);
      if (result.results.length > 0) {
        expect(result.results[0]).toHaveProperty('componentName', 'Button');
        expect(result.results[0]).toHaveProperty('matchingProps');
        expect(Object.keys(result.results[0].matchingProps)).toContain('children');
      }
    });

    it('should query components with exists operator', async () => {
      const directoryPath = join(testDataPath, 'simple-components');
      const result = await analyzer.queryComponents('Button', [
        { name: 'onClick', exists: true }
      ], { directory: directoryPath });
      
      expect(result).toHaveProperty('results');
      expect(Array.isArray(result.results)).toBe(true);
      if (result.results.length > 0) {
        expect(result.results[0]).toHaveProperty('componentName', 'Button');
        expect(result.results[0]).toHaveProperty('matchingProps');
        expect(Object.keys(result.results[0].matchingProps)).toContain('onClick');
      }
    });

    it('should query components with AND logic', async () => {
      const directoryPath = join(testDataPath, 'simple-components');
      const result = await analyzer.queryComponents('Button', [
        { name: 'variant', value: 'primary', operator: 'equals' },
        { name: 'onClick', exists: true }
      ], { directory: directoryPath, logic: 'AND' });
      
      expect(result).toHaveProperty('results');
      expect(Array.isArray(result.results)).toBe(true);
      // With AND logic, both criteria must match
      if (result.results.length > 0) {
        expect(Object.keys(result.results[0].matchingProps)).toEqual(expect.arrayContaining(['variant', 'onClick']));
      }
    });

    it('should query components with OR logic', async () => {
      const directoryPath = join(testDataPath, 'simple-components');
      const result = await analyzer.queryComponents('Button', [
        { name: 'variant', value: 'nonexistent', operator: 'equals' },
        { name: 'onClick', exists: true }
      ], { directory: directoryPath, logic: 'OR' });
      
      expect(result).toHaveProperty('results');
      expect(Array.isArray(result.results)).toBe(true);
      // With OR logic, at least one criterion should match
      if (result.results.length > 0) {
        expect(Object.keys(result.results[0].matchingProps).length).toBeGreaterThan(0);
      }
    });

    it('should query components with mixed criteria', async () => {
      const directoryPath = join(testDataPath, 'simple-components');
      const result = await analyzer.queryComponents('Button', [
        { name: 'variant', value: 'primary', operator: 'equals' },
        { name: 'disabled', exists: false },
        { name: 'children', value: 'text', operator: 'contains' }
      ], { directory: directoryPath, logic: 'OR' });
      
      expect(result).toHaveProperty('results');
      expect(Array.isArray(result.results)).toBe(true);
      if (result.results.length > 0) {
        expect(result.results[0]).toHaveProperty('componentName', 'Button');
        expect(result.results[0]).toHaveProperty('matchingProps');
        expect(result.results[0]).toHaveProperty('missingProps');
      }
    });

    it('should handle no matches gracefully', async () => {
      const directoryPath = join(testDataPath, 'simple-components');
      const result = await analyzer.queryComponents('Button', [
        { name: 'nonexistentProp', value: 'nonexistentValue', operator: 'equals' }
      ], { directory: directoryPath });
      
      expect(result).toHaveProperty('results');
      expect(Array.isArray(result.results)).toBe(true);
      expect(result.results.length).toBe(0);
    });

    it('should include matching and missing props in results', async () => {
      const directoryPath = join(testDataPath, 'simple-components');
      const result = await analyzer.queryComponents('Button', [
        { name: 'onClick', exists: true },
        { name: 'nonexistentProp', exists: true }
      ], { directory: directoryPath, logic: 'OR' });
      
      expect(result).toHaveProperty('results');
      expect(Array.isArray(result.results)).toBe(true);
      if (result.results.length > 0) {
        expect(result.results[0]).toHaveProperty('matchingProps');
        expect(result.results[0]).toHaveProperty('missingProps');
        expect(Object.keys(result.results[0].matchingProps)).toContain('onClick');
        expect(result.results[0].missingProps).toContain('nonexistentProp');
      }
    });

    it('should support format options', async () => {
      const directoryPath = join(testDataPath, 'simple-components');
      const result = await analyzer.queryComponents('Button', [
        { name: 'onClick', exists: true }
      ], { 
        directory: directoryPath,
        format: 'compact',
        includeColumns: true,
        includePrettyPaths: true
      });
      
      expect(result).toHaveProperty('results');
      expect(Array.isArray(result.results)).toBe(true);
      if (result.results.length > 0) {
        expect(result.results[0]).toHaveProperty('componentName', 'Button');
        expect(result.results[0]).toHaveProperty('column');
        expect(result.results[0]).toHaveProperty('prettyPath');
        expect(result.results[0]).toHaveProperty('allProps');
      }
    });

    it('should handle empty prop criteria array', async () => {
      const directoryPath = join(testDataPath, 'simple-components');
      const result = await analyzer.queryComponents('Button', [], { directory: directoryPath });
      
      expect(result).toHaveProperty('results');
      expect(Array.isArray(result.results)).toBe(true);
      // With empty criteria, should match all instances of the component
      expect(result.results.length).toBeGreaterThan(0);
      if (result.results.length > 0) {
        expect(result.results[0]).toHaveProperty('componentName', 'Button');
      }
    });
  });
});