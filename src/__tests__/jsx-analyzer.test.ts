import { describe, it, expect } from "vitest";
import { JSXPropAnalyzer } from "../jsx-analyzer";
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

  it("should find all usages of a specific prop", async () => {
    const propUsages = await analyzer.findPropUsage("onClick", fixturesPath);
    expect(propUsages.length).toBeGreaterThan(0);
    const buttonUsage = propUsages.find((p) => p.componentName === "Button");
    expect(buttonUsage).toBeDefined();
    expect(buttonUsage?.propName).toBe("onClick");
  });

  it("should get all props for a specific component", async () => {
    const components = await analyzer.getComponentProps("Card", fixturesPath);
    expect(components).toHaveLength(1);
    const cardComponent = components[0];
    expect(cardComponent.componentName).toBe("Card");
    expect(cardComponent.props.map((p) => p.propName)).toEqual([
      "title",
      "content",
      "onAction",
    ]);
  });

  it("should find components without a required prop", async () => {
    // First, let's add a component without the required prop
    const appContent = `
import React from 'react';
import { Button } from './Button';

const App = () => {
  return (
    <div>
      <Button>Missing onClick</Button>
    </div>
  );
};
`;
    const fs = await import("fs/promises");
    const tempFilePath = path.join(fixturesPath, "tempApp.tsx");
    await fs.writeFile(tempFilePath, appContent);

    const result = await analyzer.findComponentsWithoutProp(
      "Button",
      "onClick",
      fixturesPath,
    );

    // Cleanup the temp file
    await fs.unlink(tempFilePath);

    expect(result.missingPropUsages.length).toBe(1);
    const missingProp = result.missingPropUsages[0];
    expect(missingProp.componentName).toBe("Button");
    expect(missingProp.file).toContain("tempApp.tsx");
  });
});
