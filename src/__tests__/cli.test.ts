
import { describe, it, expect } from 'vitest';
import { exec } from 'child_process';
import * as path from 'path';

const cliPath = path.resolve(__dirname, '../../dist/cli.js');

describe('Standalone CLI Tests', () => {
  const fixturesPath = path.resolve(__dirname, 'fixtures');

  const runCli = (args: string): Promise<{ stdout: string; stderr: string }> => {
    return new Promise((resolve) => {
      exec(`node ${cliPath} ${args}`, (error, stdout, stderr) => {
        resolve({ stdout, stderr });
      });
    });
  };

  it('should show usage when no command is provided', async () => {
    const { stdout, stderr } = await runCli('');
    expect(stderr).toContain('Usage: jsx-analyzer <command> [options]');
  });

  it('should run analyze_jsx_props command', async () => {
    const { stdout, stderr } = await runCli(`analyze_jsx_props --path ${fixturesPath}`);
    expect(stderr).toBe('');
    const result = JSON.parse(stdout);
    expect(result.summary.totalFiles).toBe(3);
    expect(result.components.length).toBeGreaterThan(0);
  });

  it('should run find_prop_usage command', async () => {
    const { stdout, stderr } = await runCli(`find_prop_usage --propName onClick --path ${fixturesPath}`);
    expect(stderr).toBe('');
    const result = JSON.parse(stdout);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].propName).toBe('onClick');
  });

  it('should run get_component_props command', async () => {
    const { stdout, stderr } = await runCli(`get_component_props --componentName Card --path ${fixturesPath}`);
    expect(stderr).toBe('');
    const result = JSON.parse(stdout);
    expect(result.length).toBe(1);
    expect(result[0].componentName).toBe('Card');
  });
});
