import { describe, it, expect } from "vitest";
import { exec } from "child_process";
import * as path from "path";

const cliPath = path.resolve(__dirname, "../../dist/cli.js");

describe("Standalone CLI Tests", () => {
  const fixturesPath = path.resolve(__dirname, "fixtures");

  const runCli = (
    args: string
  ): Promise<{ stdout: string; stderr: string }> => {
    return new Promise((resolve) => {
      exec(`node ${cliPath} ${args}`, (error, stdout, stderr) => {
        resolve({ stdout, stderr });
      });
    });
  };

  it("should show usage when no command is provided", async () => {
    const { stderr } = await runCli("");
    expect(stderr).toContain("No command provided");
    expect(stderr).toContain("analyze_jsx_props");
  });

  it("should run analyze_jsx_props command", async () => {
    const { stdout, stderr } = await runCli(
      `analyze_jsx_props --path ${fixturesPath}`
    );
    expect(stderr).toBe("");
    const result = JSON.parse(stdout);
    expect(result.summary.totalFiles).toBe(4);
    expect(result.components.length).toBe(4);
    expect(result.summary.totalProps).toBe(8);
  });

  it("should run find_prop_usage command", async () => {
    const { stdout, stderr } = await runCli(
      `find_prop_usage --propName onClick --path ${fixturesPath}`
    );
    expect(stderr).toBe("");
    const result = JSON.parse(stdout);
    const totalUsages = Object.values(result.propUsages).reduce(
      (sum: number, arr: any[]) => sum + arr.length,
      0
    );
    expect(totalUsages).toBe(4);
    const allUsages = Object.values(result.propUsages).flat();
    expect(allUsages[0].propName).toBe("onClick");
    expect(result.summary.totalFiles).toBe(4);
  });

  it("should run get_component_props command", async () => {
    const { stdout, stderr } = await runCli(
      `get_component_props --componentName Card --path ${fixturesPath}`
    );
    expect(stderr).toBe("");
    const result = JSON.parse(stdout);
    const files = Object.keys(result);
    expect(files.length).toBe(1);
    const cardFilePath = files.find((file) => file.endsWith("Card.tsx"));
    expect(cardFilePath).toBeDefined();
    if (cardFilePath) {
      const cardComponents = result[cardFilePath];
      expect(cardComponents.length).toBe(1);
      expect(cardComponents[0].componentName).toBe("Card");
    }
  });
});
