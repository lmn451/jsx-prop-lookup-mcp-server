const fs = require('fs');
const path = require('path');

function resolveAndValidatePath(input, label) {
  if (typeof input !== 'string' || input.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  const abs = path.isAbsolute(input) ? input : path.resolve(process.cwd(), input);
  try {
    const stat = fs.statSync(abs);
    if (!stat.isDirectory() && !stat.isFile()) {
      throw new Error(`${label} exists but is neither a file nor directory: ${abs}`);
    }
  } catch (error) {
    throw new Error(`Invalid ${label}: ${input} -> ${abs} - ${error.message}`);
  }
  return abs;
}

function test(input, label) {
  try {
    const resolved = resolveAndValidatePath(input, label);
    console.log(`[OK] ${label}: ${input} -> ${resolved}`);
  } catch (e) {
    console.log(`[ERR] ${label}: ${input} -> ${e.message}`);
  }
}

console.log('CWD:', process.cwd());

// Tests for relative dirs/files present in repo
 test('./src', 'directory');
 test('./examples/sample-components', 'directory');
 test('./README.md', 'file');

// Absolute path test
 test(path.resolve('./src'), 'directory');

// Non-existent path test
 test('./does-not-exist', 'directory');
