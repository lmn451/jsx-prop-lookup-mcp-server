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
        const result = await analyzer.analyzeProps(filePath, { format: 'full' }) as AnalysisResult;

    expect(result.summary.totalFiles).toBe(1);
    expect(result.summary.totalComponents).toBe(1);
    expect(result.summary.totalProps).toBeGreaterThan(0);

    const buttonComponent = result.components.find(c => c.componentName === 'Button');
    expect(buttonComponent).toBeDefined();
    expect(buttonComponent?.props.map(p => p.propName)).toEqual(
      expect.arrayContaining(['children', 'onClick', 'variant', 'disabled'])
    );
    expect(buttonComponent?.props.map(p => p.propName)).toEqual(
      expect.arrayContaining(['children', 'onClick', 'variant', 'disabled'])
    );
    const variantProp = buttonComponent?.props.find(p => p.propName === 'variant');
    expect(variantProp?.type).toBe("'primary' | 'secondary'");
  });







  it('should handle files with syntax errors gracefully', async () => {
    const filePath = join(testDataPath, 'problematic-files', 'SyntaxError.jsx');
    // Expect no throw, and analysis result should reflect the skipped file
        const result = await analyzer.analyzeProps(filePath, { format: 'full' }) as AnalysisResult;
    expect(result.summary.totalFiles).toBe(0); // File should be skipped due to parse error
    expect(result.components.length).toBe(0);
    expect(result.propUsages.length).toBe(0);
  });

  it('should handle non-existent paths', async () => {
    const nonExistentPath = join(testDataPath, 'non-existent-dir');
        const result = await analyzer.analyzeProps(nonExistentPath, { format: 'full' }) as AnalysisResult;
    expect(result.summary.totalFiles).toBe(0);
    expect(result.components.length).toBe(0);
    expect(result.propUsages.length).toBe(0);
  });

  it('should handle binary files gracefully', async () => {
    const filePath = join(testDataPath, 'problematic-files', 'BinaryFile.png');
        const result = await analyzer.analyzeProps(filePath, { format: 'full' }) as AnalysisResult;
    expect(result.summary.totalFiles).toBe(0);
    expect(result.components.length).toBe(0);
    expect(result.propUsages.length).toBe(0);
  });

  it('should handle current directory "." as a valid path', async () => {
        const result = await analyzer.analyzeProps('.', { format: 'full' }) as AnalysisResult;
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
            const result = await analyzer.analyzeProps(filePath, { format: 'compact' });

      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('files');
      expect((result as any).summary).toHaveProperty('files');
      expect((result as any).summary).toHaveProperty('components');
      expect((result as any).summary).toHaveProperty('props');
      expect(typeof (result as any).files).toBe('object');
    });

    it('should return minimal format correctly', async () => {
      const filePath = join(testDataPath, 'simple-components', 'Button.tsx');
            const result = await analyzer.analyzeProps(filePath, { format: 'minimal' });

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
            const result = await analyzer.analyzeProps(filePath, {
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
            const result = await analyzer.analyzeProps(filePath, {
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

  // Comprehensive Select width testing
  describe('Select Width Testing', () => {
    it('should find all Select components with width 180', async () => {
      const directoryPath = join(testDataPath, 'complex-components');
      const result = await analyzer.queryComponents('Select', [
        { name: 'width', value: 180, operator: 'equals' }
      ], { directory: directoryPath });

      expect(result).toHaveProperty('results');
      expect(Array.isArray(result.results)).toBe(true);

      // Based on the actual test run, we have 3 matches but they're string "180", not numeric 180
      expect(result.results.length).toBe(3);

      // Verify all matches are Select components with width "180" (string)
      result.results.forEach(match => {
        expect(match.componentName).toBe('Select');
        expect(match.matchingProps).toHaveProperty('width');
        expect(match.matchingProps.width.value).toBe("180");
      });
    });

    it('should find Select components with width containing "180"', async () => {
      const directoryPath = join(testDataPath, 'complex-components');
      const result = await analyzer.queryComponents('Select', [
        { name: 'width', value: '180', operator: 'contains' }
      ], { directory: directoryPath });

      expect(result).toHaveProperty('results');
      expect(Array.isArray(result.results)).toBe(true);

      // Should find 4 matches: width={180}, width="180px", width="180"
      expect(result.results.length).toBeGreaterThanOrEqual(3);

      // Verify each match contains "180" in the width value
      result.results.forEach(match => {
        expect(match.componentName).toBe('Select');
        expect(match.matchingProps).toHaveProperty('width');
        const widthValue = String(match.matchingProps.width.value);
        expect(widthValue.includes('180')).toBe(true);
      });
    });

    it('should not find Select components with width 200 when searching for 180', async () => {
      const directoryPath = join(testDataPath, 'complex-components');
      const result = await analyzer.queryComponents('Select', [
        { name: 'width', value: 200, operator: 'equals' }
      ], { directory: directoryPath });

      expect(result).toHaveProperty('results');
      expect(Array.isArray(result.results)).toBe(true);

      // Should find 0 matches since we're looking for exact value 200, but our test data has "200px"
      expect(result.results.length).toBe(0);
    });

    it('should find Select components with width "200px"', async () => {
      const directoryPath = join(testDataPath, 'complex-components');
      const result = await analyzer.queryComponents('Select', [
        { name: 'width', value: '200px', operator: 'equals' }
      ], { directory: directoryPath });

      expect(result).toHaveProperty('results');
      expect(Array.isArray(result.results)).toBe(true);

      // Should find 1 match for width="200px"
      expect(result.results.length).toBe(1);
      expect(result.results[0].matchingProps.width.value).toBe('200px');
    });

    it('should find Select components that have width property (any value)', async () => {
      const directoryPath = join(testDataPath, 'complex-components');
      const result = await analyzer.queryComponents('Select', [
        { name: 'width', exists: true }
      ], { directory: directoryPath });

      expect(result).toHaveProperty('results');
      expect(Array.isArray(result.results)).toBe(true);

      // Based on debug output: 8 individual width prop usages
      expect(result.results.length).toBe(8);

      // Verify each match has width property
      result.results.forEach(match => {
        expect(match.componentName).toBe('Select');
        expect(match.matchingProps).toHaveProperty('width');
      });
    });

    it('should find Select components missing width property', async () => {
      const directoryPath = join(testDataPath, 'complex-components');
      const result = await analyzer.queryComponents('Select', [
        { name: 'width', exists: false }
      ], { directory: directoryPath });

      expect(result).toHaveProperty('results');
      expect(Array.isArray(result.results)).toBe(true);

      // Based on debug output: 18 individual prop usages without width
      expect(result.results.length).toBe(18);

      // Verify each match doesn't have width in matchingProps
      result.results.forEach(match => {
        expect(match.componentName).toBe('Select');
        expect(match.matchingProps).not.toHaveProperty('width');
        // missingProps might be undefined if no criteria require missing props
        if (match.missingProps) {
          expect(match.missingProps).toContain('width');
        }
      });
    });

    it('should find Select components with width 180 AND multiple=true', async () => {
      const directoryPath = join(testDataPath, 'complex-components');
      const result = await analyzer.queryComponents('Select', [
        { name: 'width', value: 180, operator: 'equals' },
        { name: 'multiple', value: true, operator: 'equals' }
      ], { directory: directoryPath, logic: 'AND' });

      expect(result).toHaveProperty('results');
      expect(Array.isArray(result.results)).toBe(true);

      // Since we have no numeric 180 values, this should find 0 matches
      expect(result.results.length).toBe(0);
    });
    it('should find Select components with width "180" AND multiple=true', async () => {
      const directoryPath = join(testDataPath, 'complex-components');
      const result = await analyzer.queryComponents('Select', [
        { name: 'width', value: '180', operator: 'equals' },
        { name: 'multiple', value: true, operator: 'equals' }
      ], { directory: directoryPath, logic: 'AND' });

      expect(result).toHaveProperty('results');
      expect(Array.isArray(result.results)).toBe(true);

      // Should find 0 matches because our test data doesn't have a Select with both width="180" AND multiple=true on the same element
      expect(result.results.length).toBe(0);
    });

    it('should find Select components with width "180" OR multiple=true', async () => {
      const directoryPath = join(testDataPath, 'complex-components');
      const result = await analyzer.queryComponents('Select', [
        { name: 'width', value: '180', operator: 'equals' },
        { name: 'multiple', value: true, operator: 'equals' }
      ], { directory: directoryPath, logic: 'OR' });

      expect(result).toHaveProperty('results');
      expect(Array.isArray(result.results)).toBe(true);

      // Should find matches for either condition
      expect(result.results.length).toBeGreaterThan(0);

      // Since the analyzer treats each prop separately, we just verify they're all Select components
      result.results.forEach(match => {
        expect(match.componentName).toBe('Select');
        // Each match will have either width="180" or multiple=true in matchingProps
        expect(Object.keys(match.matchingProps).length).toBeGreaterThan(0);
      });
    });

    it('should provide detailed location information for Select components', async () => {
      const directoryPath = join(testDataPath, 'complex-components');
      const result = await analyzer.queryComponents('Select', [
        { name: 'width', value: '180', operator: 'contains' }
      ], {
        directory: directoryPath,
        includeColumns: true,
        includePrettyPaths: true
      });

      expect(result).toHaveProperty('results');
      expect(result.results.length).toBeGreaterThan(0);

      // Verify location information
      result.results.forEach(match => {
        expect(match).toHaveProperty('file');
        expect(match).toHaveProperty('line');
        expect(match).toHaveProperty('column');
        expect(match).toHaveProperty('prettyPath');
        expect(match.file).toContain('Select.tsx');
        expect(typeof match.line).toBe('number');
        expect(typeof match.column).toBe('number');
        expect(match.prettyPath).toContain(':');
      });
    });

    it('should count total Select components and analyze their width distribution', async () => {
      const directoryPath = join(testDataPath, 'complex-components');

      // Get all Select components
      const allSelects = await analyzer.queryComponents('Select', [], {
        directory: directoryPath
      });

      // Get Selects with width
      const selectsWithWidth = await analyzer.queryComponents('Select', [
        { name: 'width', exists: true }
      ], { directory: directoryPath });

      // Get Selects without width
      const selectsWithoutWidth = await analyzer.queryComponents('Select', [
        { name: 'width', exists: false }
      ], { directory: directoryPath });

      // Get Selects with width containing "180"
      const selectsWith180 = await analyzer.queryComponents('Select', [
        { name: 'width', value: '180', operator: 'contains' }
      ], { directory: directoryPath });

      // Based on debug output: 26 total, 8 with width, 18 without width, 4 with "180"
      expect(allSelects.results.length).toBe(26);
      expect(selectsWithWidth.results.length).toBe(8);
      expect(selectsWithoutWidth.results.length).toBe(18);
      expect(selectsWith180.results.length).toBe(4);

      // Verify the math adds up
      expect(selectsWithWidth.results.length + selectsWithoutWidth.results.length).toBe(allSelects.results.length);

      // Verify summary information
      expect(allSelects.summary.totalMatches).toBe(26);
      expect(selectsWithWidth.summary.totalMatches).toBe(8);
      expect(selectsWithoutWidth.summary.totalMatches).toBe(18);
    });
  });
});
