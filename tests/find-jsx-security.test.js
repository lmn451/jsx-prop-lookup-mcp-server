import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ProjectWorkspace } from '../dist/project.js';
import { findJsx } from '../dist/find-jsx.js';

// Real filesystem security boundary: query only the caller, so dependency resolution
// is responsible for rejecting a dependency in the discovery-excluded node_modules.
test('import resolution cannot read an outside file through an inside symlink', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'find-jsx-import-boundary-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const root = path.join(directory, 'project');
  fs.mkdirSync(root);
  const outside = path.join(directory, 'private.tsx');
  fs.writeFileSync(outside, 'export const Button = () => <Private secret="must-stay-private" />;');
  fs.mkdirSync(path.join(root, 'node_modules', 'private-ui'), { recursive: true });
  fs.symlinkSync(outside, path.join(root, 'node_modules', 'private-ui', 'index.tsx'));
  fs.writeFileSync(
    path.join(root, 'app.tsx'),
    "import { Button } from 'private-ui'; const x = <Button />;"
  );
  const result = await findJsx(new ProjectWorkspace({ root }), {
    path: 'app.tsx',
    component: 'Button',
  });
  assert.equal(result.total, 1);
  assert.equal(result.complete, false);
  assert.deepEqual(result.matches[0].identity, { source: 'private-ui', exportName: 'Button' });
  assert.equal(JSON.stringify(result).includes('must-stay-private'), false);
});
