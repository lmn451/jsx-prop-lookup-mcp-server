import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const packageJsonPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'package.json'
);

function readPackageVersion(): string {
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
      version?: unknown;
    };

    if (typeof packageJson.version === 'string' && packageJson.version.length > 0) {
      return packageJson.version;
    }
  } catch {
    // Fall back to a neutral version if package metadata is unavailable.
  }

  return '0.0.0';
}

export const PACKAGE_VERSION = readPackageVersion();
