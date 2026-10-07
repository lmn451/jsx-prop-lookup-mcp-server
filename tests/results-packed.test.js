import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

test('packed package exposes result pagination and Unicode snippets', async (t) => {
  const tempDirectory = mkdtempSync(path.join(tmpdir(), 'jsx-results-packed-'));
  t.after(() => rmSync(tempDirectory, { recursive: true, force: true }));

  const packedFiles = JSON.parse(
    execFileSync(
      'npm',
      ['pack', '--ignore-scripts', '--pack-destination', tempDirectory, '--json'],
      { cwd: process.cwd(), encoding: 'utf8' }
    )
  );
  const packedFile = Array.isArray(packedFiles) ? packedFiles[0] : Object.values(packedFiles)[0];
  assert.ok(packedFile?.filename, 'npm pack should report the created archive');
  const archivePath = path.join(tempDirectory, packedFile.filename);
  execFileSync('tar', ['-xzf', archivePath, '-C', tempDirectory]);

  const packageDirectory = path.join(tempDirectory, 'package');
  const packageInfo = JSON.parse(readFileSync(path.join(packageDirectory, 'package.json'), 'utf8'));
  assert.equal(packageInfo.name, 'jsx-prop-lookup-mcp-server');

  const { paginateResults, sourceSnippet } = await import(
    pathToFileURL(path.join(packageDirectory, 'dist', 'results.js')).href
  );
  const unresolved = [{ filePath: 'src/Unknown.tsx', reason: 'Dynamic component' }];
  const page = paginateResults(
    [
      { filePath: 'src/B.tsx', line: 1, column: 1 },
      { filePath: 'src/A.tsx', line: 3, column: 2 },
      { filePath: 'src/A.tsx', line: 2, column: 4 },
    ],
    { offset: 1, limit: 1 },
    unresolved
  );

  assert.deepEqual(page, {
    matches: [{ filePath: 'src/A.tsx', line: 3, column: 2 }],
    total: 3,
    offset: 1,
    limit: 1,
    nextOffset: 2,
    unresolved,
    complete: false,
  });
  assert.equal(sourceSnippet(`${'😀'.repeat(241)}\r\nnext`, 1), `${'😀'.repeat(239)}…`);
});
