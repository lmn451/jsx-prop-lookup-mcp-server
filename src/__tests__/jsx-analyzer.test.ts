import { describe, it, expect } from "vitest";
import { JSXPropAnalyzer, PropUsage } from "../jsx-analyzer";
import * as path from "path";

describe("JSXPropAnalyzer", () => {
  const analyzer = new JSXPropAnalyzer();
  const fixturesPath = path.resolve(__dirname, "fixtures");

  it("should correctly analyze props in a simple component", async () => {
    const buttonPath = path.join(fixturesPath, "Button.tsx");
    const result = await analyzer.analyzeProps(buttonPath, "Button");

    expect(result.components).toHaveLength(1);
    const buttonComponent = result.components[0];
    expect(buttonComponent.componentName).toBe("Button");
    expect(buttonComponent.props).toHaveLength(3);
    expect(buttonComponent.props.map((p) => p.propName)).toEqual([
      "onClick",
      "children",
      "disabled",
    ]);
  });

  it("should find all usages of a specific prop and return AnalysisResult", async () => {
    const result = await analyzer.findPropUsage("onClick", fixturesPath);
    const totalUsages = Object.values(result.propUsages).reduce(
      (sum: number, arr: PropUsage[]) => sum + arr.length,
      0,
    );
    expect(totalUsages).toBe(4);
    const allUsages = Object.values(result.propUsages).flat();
    const buttonUsage = allUsages.find((p) => p.componentName === "Button");
    expect(buttonUsage).toBeDefined();
    expect(buttonUsage?.propName).toBe("onClick");
    expect(result.summary.totalFiles).toBe(4);
  });

  it("should get all props for a specific component, grouped by file", async () => {
    const components = await analyzer.getComponentProps("Card", fixturesPath);
    const files = Object.keys(components);
    expect(files.length).toBeGreaterThan(0);

    const cardFilePath = files.find((file) => file.endsWith("Card.tsx"));
    expect(cardFilePath).toBeDefined();

    if (cardFilePath) {
      const cardComponents = components[cardFilePath];
      expect(cardComponents).toHaveLength(1);
      const cardComponent = cardComponents[0];
      expect(cardComponent.componentName).toBe("Card");
      expect(cardComponent.props.map((p) => p.propName)).toEqual([
        "title",
        "content",
        "onAction",
      ]);
    }
  });

  it("should group propUsages by file", async () => {
    const result = await analyzer.analyzeProps(fixturesPath);
    const propUsageFiles = Object.keys(result.propUsages);
    expect(propUsageFiles.length).toBeGreaterThan(0);
    propUsageFiles.forEach((file) => {
      expect(typeof file).toBe("string");
      expect(Array.isArray(result.propUsages[file])).toBe(true);
      expect(result.propUsages[file].length).toBeGreaterThan(0);
    });
  });

  it("should find components without a required prop", async () => {
    const result = await analyzer.findComponentsWithoutProp(
      "Button",
      "onClick",
      fixturesPath,
    );

    const files = Object.keys(result.missingPropUsages);
    expect(files.length).toBe(1);

    const missingPropFilePath = files.find((file) =>
      file.endsWith("AppWithMissingProp.tsx"),
    );
    expect(missingPropFilePath).toBeDefined();

    if (missingPropFilePath) {
      const missingPropsInFile = result.missingPropUsages[missingPropFilePath];
      expect(missingPropsInFile.length).toBe(1);
      const missingProp = missingPropsInFile[0];
      expect(missingProp.componentName).toBe("Button");
    }
  });
});
