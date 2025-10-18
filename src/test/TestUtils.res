// Test utilities for ReScript JSX Prop Analyzer
// Provides helper functions for testing the analyzer functionality

// Test file paths
let testFixturesDir = "./src/__tests__/fixtures"
let testOutputDir = "./src/__tests__/output"

// Test data creation utilities
let createMockPropUsage = (
  ~propName: string,
  ~componentName: string,
  ~line: int,
  ~column: int,
  ~value: option<string>=?,
  ~isSpread: option<bool>=?,
  ~type_: option<string>=?
): AnalyzerTypes.propUsage => {
  {
    propName: propName,
    componentName: componentName,
    line: line,
    column: column,
    value: value,
    isSpread: isSpread,
    type_: type_
  }
}

let createMockComponentAnalysis = (
  ~componentName: string,
  ~file: string,
  ~props: array<AnalyzerTypes.propUsage>,
  ~propsInterface: option<string>=?
): AnalyzerTypes.componentAnalysis => {
  {
    componentName: componentName,
    file: file,
    props: props,
    propsInterface: propsInterface
  }
}

let createMockAnalysisSummary = (
  ~totalFiles: int,
  ~totalComponents: int,
  ~totalProps: int
): AnalyzerTypes.analysisSummary => {
  {
    totalFiles: totalFiles,
    totalComponents: totalComponents,
    totalProps: totalProps
  }
}

// File I/O test helpers
let readTestFile = (filename: string): string => {
  let filePath = BunBindings.join([testFixturesDir, filename])
  try {
    BunBindings.readFileSync(filePath, "utf-8")
  } catch {
    | _ => ""
  }
}

let writeTestOutput = (filename: string, content: string): unit => {
  let filePath = BunBindings.join([testOutputDir, filename])
  try {
    BunBindings.writeFileSync(filePath, content)
  } catch {
    | _ => ()
  }
}

// Test assertion helpers
let assertFileExists = (path: string): bool => {
  BunBindings.existsSync(path)
}

let assertFileIsValid = (path: string): bool => {
  if !assertFileExists(path) {
    false
  } else {
    let stats = BunBindings.statSync(path)
    stats.isFile()
  }
}

// Performance testing utilities
type benchmarkResult = {
  operation: string,
  duration: float,
  memoryUsage: int
}

let benchmark = (operationName: string, fn: unit => 'a): benchmarkResult => {
  let startTime = Js.Date.now()
  let initialMemory = 0 // Would need actual memory measurement

  let _result = fn()

  let endTime = Js.Date.now()
  let duration = endTime -. startTime

  {
    operation: operationName,
    duration: duration,
    memoryUsage: initialMemory
  }
}

// Test data for common scenarios
let sampleJSXContent = `
import React from 'react';

interface ButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}

const Button: React.FC<ButtonProps> = ({ onClick, children, disabled }) => {
  return (
    <button onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
};

export default Button;
`

let sampleUsageContent = `
import React from 'react';
import { Button } from './Button';

const App = () => {
  return (
    <div>
      <Button onClick={() => console.log('clicked')}>
        Click me
      </Button>
      <Button onClick={() => console.log('disabled')} disabled={true}>
        Disabled button
      </Button>
    </div>
  );
};

export default App;
`