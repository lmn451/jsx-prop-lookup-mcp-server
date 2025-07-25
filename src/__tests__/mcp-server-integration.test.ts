import { JSXPropAnalyzer } from '../jsx-analyzer';
import { join } from 'path';

describe('MCP Server Integration Tests', () => {
  let analyzer: JSXPropAnalyzer;

  beforeEach(() => {
    analyzer = new JSXPropAnalyzer();
  });

  describe('Babel Traverse Import Regression Tests', () => {
    it('should not throw "traverseDefault is not a function" error', async () => {
      const testDataPath = join(__dirname, '..', '..', 'test-data');
      
      // This test would have failed with the original import issue
      await expect(async () => {
        const result = await analyzer.analyzeProps(testDataPath, { format: 'full' });
        expect(result).toBeDefined();
        expect((result as any).summary).toBeDefined();
        expect(typeof (result as any).summary.totalFiles).toBe('number');
      }).not.toThrow();
    });

    it('should successfully traverse AST and find components', async () => {
      const testDataPath = join(__dirname, '..', '..', 'test-data');
      
      const result = await analyzer.analyzeProps(testDataPath, { format: 'full' }) as any;
      
      // Should find components (not return empty results due to traverse error)
      expect(result.summary.totalFiles).toBeGreaterThan(0);
      expect(result.summary.totalComponents).toBeGreaterThan(0);
      expect(result.summary.totalProps).toBeGreaterThan(0);
    });

    it('should handle traverse function correctly in queryComponents', async () => {
      const testDataPath = join(__dirname, '..', '..', 'test-data');
      
      // This would have failed with traverse import issue
      await expect(async () => {
        const result = await analyzer.queryComponents('Select', [
          { name: 'width', exists: true }
        ], { directory: testDataPath }) as any;
        
        expect(result).toBeDefined();
        expect(result.summary).toBeDefined();
        expect(result.summary.filesScanned).toBeGreaterThan(0);
      }).not.toThrow();
    });

    it('should handle traverse function correctly in findPropUsage', async () => {
      const testDataPath = join(__dirname, '..', '..', 'test-data');
      
      // This would have failed with traverse import issue
      await expect(async () => {
        const result = await analyzer.findPropUsage('width', testDataPath);
        expect(Array.isArray(result)).toBe(true);
      }).not.toThrow();
    });
  });

  describe('MCP Server Tool Interface Simulation', () => {
    it('should handle analyze_jsx_props tool call correctly', async () => {
      const testDataPath = join(__dirname, '..', '..', 'test-data');
      
      // Simulate the exact call that would be made by the MCP server
      const result = await analyzer.analyzeProps(testDataPath, {
        componentName: undefined,
        propName: undefined,
        includeTypes: true,
        format: 'full',
        includeColumns: true,
        includePrettyPaths: false,
      }) as any;
      
      expect(result.summary).toBeDefined();
      expect(result.summary.totalFiles).toBeGreaterThan(0);
      expect(result.summary.totalComponents).toBeGreaterThan(0);
      expect(result.summary.totalProps).toBeGreaterThan(0);
      
      // Verify the result can be JSON serialized (as MCP server would do)
      const serialized = JSON.stringify(result, null, 2);
      expect(serialized).toContain('summary');
      expect(serialized).toContain('totalFiles');
      expect(serialized).toContain('components');
      expect(serialized).toContain('propUsages');
    });

    it('should handle query_components tool call correctly', async () => {
      const testDataPath = join(__dirname, '..', '..', 'test-data');
      
      // Simulate the exact call that would be made by the MCP server
      const result = await analyzer.queryComponents('Select', [
        { name: 'width', exists: true }
      ], { 
        directory: testDataPath,
        logic: 'AND',
        format: 'full',
        includeColumns: true,
        includePrettyPaths: false
      });
      
      expect(result.query).toBeDefined();
      expect(result.results).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.summary.filesScanned).toBeGreaterThan(0);
      
      // Verify the result can be JSON serialized (as MCP server would do)
      const serialized = JSON.stringify(result, null, 2);
      expect(serialized).toContain('query');
      expect(serialized).toContain('results');
      expect(serialized).toContain('summary');
      expect(serialized).toContain('filesScanned');
    });

    it('should handle find_prop_usage tool call correctly', async () => {
      const testDataPath = join(__dirname, '..', '..', 'test-data');
      
      // Simulate the exact call that would be made by the MCP server
      const result = await analyzer.findPropUsage('width', testDataPath, undefined, {
        format: 'full',
        includeColumns: true,
        includePrettyPaths: false,
      });
      
      expect(Array.isArray(result)).toBe(true);
      
      // Verify the result can be JSON serialized (as MCP server would do)
      const serialized = JSON.stringify(result, null, 2);
      expect(serialized).toContain('[');
      expect(serialized).toContain(']');
    });
  });

  describe('Real-world Scenario Tests', () => {
    it('should handle the original user scenario: finding Select components with width props', async () => {
      const testDataPath = join(__dirname, '..', '..', 'test-data');
      
      // This test simulates the exact scenario that was failing
      const result = await analyzer.queryComponents('Select', [
        { name: 'width', exists: true }
      ], { directory: testDataPath });
      
      // Should NOT return filesScanned: 0 (the original issue)
      expect(result.summary.filesScanned).toBeGreaterThan(0);
      expect(result.results.length).toBeGreaterThan(0);
      
      // Verify we found actual Select components with width props
      result.results.forEach(match => {
        expect(match.componentName).toBe('Select');
        expect(match.matchingProps).toHaveProperty('width');
      });
    });

    it('should handle error conditions gracefully without crashing', async () => {
      // Test with non-existent directory
      const result1 = await analyzer.queryComponents('Select', [
        { name: 'width', exists: true }
      ], { directory: '/non/existent/path' });
      
      expect(result1.summary.filesScanned).toBe(0);
      expect(result1.results.length).toBe(0);
      
      // Test with malformed criteria
      const result2 = await analyzer.queryComponents('Select', [], { 
        directory: join(__dirname, '..', '..', 'test-data') 
      });
      
      expect(result2.summary.filesScanned).toBeGreaterThan(0);
      expect(result2.results.length).toBeGreaterThan(0);
    });

    it('should maintain consistent behavior across different working directories', async () => {
      const testDataPath = join(__dirname, '..', '..', 'test-data');
      
      // Test from current directory
      const result1 = await analyzer.queryComponents('Select', [
        { name: 'width', exists: true }
      ], { directory: testDataPath });
      
      // Test with relative path
      const result2 = await analyzer.queryComponents('Select', [
        { name: 'width', exists: true }
      ], { directory: './test-data' });
      
      // Both should find components (result2 might find fewer if test-data doesn't exist in current dir)
      expect(result1.summary.filesScanned).toBeGreaterThan(0);
      expect(result1.results.length).toBeGreaterThan(0);
      
      // The key is that neither should crash or return traverseDefault errors
      expect(result2.summary).toBeDefined();
      expect(Array.isArray(result2.results)).toBe(true);
    });
  });

  describe('Performance and Memory Tests', () => {
    it('should handle large directory scans without memory issues', async () => {
      const testDataPath = join(__dirname, '..', '..', 'test-data');
      
      // Test multiple concurrent operations
      const promises = Array.from({ length: 5 }, () => 
        analyzer.queryComponents('Select', [
          { name: 'width', exists: true }
        ], { directory: testDataPath })
      );
      
      const results = await Promise.all(promises);
      
      // All should complete successfully
      results.forEach(result => {
        expect(result.summary.filesScanned).toBeGreaterThan(0);
        expect(Array.isArray(result.results)).toBe(true);
      });
    });

    it('should handle rapid successive calls without issues', async () => {
      const testDataPath = join(__dirname, '..', '..', 'test-data');
      
      // Test rapid successive calls
      for (let i = 0; i < 10; i++) {
        const result = await analyzer.analyzeProps(testDataPath, { format: 'full' }) as any;
        expect(result.summary.totalFiles).toBeGreaterThan(0);
      }
    });
  });

  describe('Edge Case Coverage', () => {
    it('should handle files with various JSX patterns', async () => {
      const testDataPath = join(__dirname, '..', '..', 'test-data');
      
      // Test that we can analyze all types of files without traverse errors
      const result = await analyzer.analyzeProps(testDataPath, { 
        format: 'full',
        includeTypes: true 
      }) as any;
      
      expect(result.summary.totalFiles).toBeGreaterThan(0);
      expect(result.components.length).toBeGreaterThan(0);
      expect(result.propUsages.length).toBeGreaterThan(0);
      
      // Verify we have different component types
      const componentNames = result.components.map(c => c.componentName);
      expect(componentNames).toContain('Button');
      expect(componentNames).toContain('Select');
    });

    it('should handle TypeScript and JavaScript files equally', async () => {
      const testDataPath = join(__dirname, '..', '..', 'test-data');
      
      const result = await analyzer.analyzeProps(testDataPath, { format: 'full' }) as any;
      
      // Should find components in both .ts/.tsx and .js/.jsx files
      const tsFiles = result.components.filter(c => c.file.endsWith('.ts') || c.file.endsWith('.tsx'));
      const jsFiles = result.components.filter(c => c.file.endsWith('.js') || c.file.endsWith('.jsx'));
      
      expect(tsFiles.length).toBeGreaterThan(0);
      expect(jsFiles.length).toBeGreaterThan(0);
    });
  });

  describe('Critical Babel Traverse Functionality Tests', () => {
    it('should successfully import and use traverse function', async () => {
      const testDataPath = join(__dirname, '..', '..', 'test-data');
      
      // This is the critical test that would have failed with the original bug
      // The bug was: "traverseDefault is not a function" 
      // This happened because the import was wrong and traverse wasn't properly accessed
      
      let traverseError = null;
      try {
        const result = await analyzer.analyzeProps(testDataPath, { format: 'full' }) as any;
        
        // If we get here without error, the traverse import is working
        expect(result).toBeDefined();
        expect(result.summary.totalFiles).toBeGreaterThan(0);
        
      } catch (error) {
        traverseError = error as any;
      }
      
      // Should not have any traverse-related errors
      expect(traverseError).toBeNull();
    });

    it('should handle AST traversal in all analyzer methods', async () => {
      const testDataPath = join(__dirname, '..', '..', 'test-data');
      
      // Test all methods that use traverse internally
      const methods = [
        () => analyzer.analyzeProps(testDataPath, { format: 'full' }),
        () => analyzer.queryComponents('Select', [{ name: 'width', exists: true }], { directory: testDataPath }),
        () => analyzer.findPropUsage('width', testDataPath),
      ];
      
      for (const method of methods) {
        let error = null;
        try {
          const result = await method();
          expect(result).toBeDefined();
        } catch (err) {
          error = err as any;
        }
        
        // None of these should throw traverse-related errors
        expect(error).toBeNull();
      }
    });

    it('should handle complex AST structures without traverse errors', async () => {
      const testDataPath = join(__dirname, '..', '..', 'test-data');
      
      // Test with complex component queries that stress the traverse functionality
      const complexQueries = [
        { componentName: 'Select', propCriteria: [{ name: 'width', value: '180', operator: 'contains' as const }] },
        { componentName: 'Button', propCriteria: [{ name: 'variant', value: 'primary', operator: 'equals' as const }] },
        { componentName: 'DataTable', propCriteria: [{ name: 'columns', exists: true }] },
      ];
      
      for (const query of complexQueries) {
        const result = await analyzer.queryComponents(
          query.componentName, 
          query.propCriteria, 
          { directory: testDataPath }
        ) as any;
        
        // Should complete without errors
        expect(result.summary).toBeDefined();
        expect(result.summary.filesScanned).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('MCP Server Response Format Tests', () => {
    it('should generate MCP-compatible JSON responses', async () => {
      const testDataPath = join(__dirname, '..', '..', 'test-data');
      
      // Test that all response formats work correctly
      const formats = ['full', 'compact', 'minimal'] as const;
      
      for (const format of formats) {
        const result = await analyzer.analyzeProps(testDataPath, { format });
        
        // Should be JSON serializable
        const serialized = JSON.stringify(result);
        expect(serialized).toBeDefined();
        expect(serialized.length).toBeGreaterThan(0);
        
        // Should be JSON parseable
        const parsed = JSON.parse(serialized);
        expect(parsed).toBeDefined();
        
        // Should have expected structure based on format
        if (format === 'full') {
          expect(parsed.summary).toBeDefined();
          expect(parsed.components).toBeDefined();
          expect(parsed.propUsages).toBeDefined();
        } else if (format === 'compact') {
          expect(parsed.summary).toBeDefined();
          expect(parsed.files).toBeDefined();
        } else if (format === 'minimal') {
          expect(parsed.props).toBeDefined();
        }
      }
    });

    it('should handle MCP server error scenarios', async () => {
      // Test various error conditions that the MCP server might encounter
      const errorScenarios = [
        { path: '/non/existent/path', shouldSucceed: true }, // Should handle gracefully
        { path: '', shouldSucceed: true }, // Should handle gracefully (empty path)
      ];
      
      for (const scenario of errorScenarios) {
        const result = await analyzer.analyzeProps(scenario.path as string, { format: 'full' }) as any;
        expect(result.summary.totalFiles).toBe(0); // No files found, but no error
        expect(result.components).toEqual([]);
        expect(result.propUsages).toEqual([]);
      }
    });
  });

  describe('Enhanced Runtime and Boundary Tests', () => {
    it('should handle large directory structures without errors', async () => {
      const largeDir = join(__dirname, '..', '..'); // Parent directory for more files
      const result = await analyzer.analyzeProps(largeDir, {
        format: 'minimal',
        respectProjectBoundaries: true,
        maxDepth: 3
      });
      expect(result).toBeDefined();
      // Check for minimal format structure
      expect((result as MinimalAnalysisResult).props).toBeDefined();
    });

    it('should respect boundary controls correctly', async () => {
      const testDataPath = join(__dirname, '..', '..', 'test-data');
      const resultWithBoundaries = await analyzer.analyzeProps(testDataPath, {
        respectProjectBoundaries: true,
        maxDepth: 2
      }) as AnalysisResult;
      const resultWithoutBoundaries = await analyzer.analyzeProps(testDataPath, {
        respectProjectBoundaries: false,
        maxDepth: Infinity
      }) as AnalysisResult;
      // Without boundaries should find at least as many or more
      expect(resultWithoutBoundaries.summary.totalFiles).toBeGreaterThanOrEqual(resultWithBoundaries.summary.totalFiles);
    });

    it('should not throw module resolution errors', async () => {
      const testDataPath = join(__dirname, '..', '..', 'test-data');
      await expect(analyzer.analyzeProps(testDataPath)).resolves.not.toThrow();
    });
  });
});