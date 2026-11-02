import assert from 'node:assert/strict';
import console from 'node:console';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { findPackageJSON } from 'node:module';
import { performance } from 'node:perf_hooks';
import { findJsx } from '../dist/find-jsx.js';
import { ProjectWorkspace } from '../dist/project.js';
import { createJsxSnapshot } from '../dist/jsx-query.js';
import { collectJsxWithSwc } from '../dist/swc-discovery.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jsx-discovery-benchmark-'));
const files = 40;
const perFile = 25;
const iterations = 15;

function statistics(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    medianMs: Number(sorted[Math.floor(sorted.length / 2)].toFixed(3)),
    p95Ms: Number(sorted[Math.ceil(sorted.length * 0.95) - 1].toFixed(3)),
  };
}

try {
  fs.writeFileSync(
    path.join(root, 'Button.tsx'),
    'export function Button(props: {label: string; disabled?: boolean}) { return null; }'
  );
  for (let file = 0; file < files; file++) {
    const tags = Array.from(
      { length: perFile },
      (_, tag) =>
        `<Action label="${file}-${tag}" {...{'data-id': ${tag}}} disabled={false}>Save</Action>`
    ).join('\n');
    fs.writeFileSync(
      path.join(root, `Usage${file}.tsx`),
      `import {Button as Action} from './Button';\nexport const view = <>\n${tags}\n</>;`
    );
  }
  const project = new ProjectWorkspace({ root });
  const query = { component: 'Button', source: './Button', limit: 500 };
  const baseline = await findJsx(project, query);
  const candidate = await findJsx(project, { ...query, discovery: 'swc' });
  assert.deepEqual(candidate, baseline);
  assert.equal(candidate.total, files * perFile);
  assert.equal(candidate.complete, true);
  const snapshot = await createJsxSnapshot(project);
  const discovery = collectJsxWithSwc(snapshot);
  assert.equal(discovery.fallbackFiles.length, 0);
  const samples = { typescript: [], swc: [] };
  for (let round = -3; round < iterations; round++) {
    const order = round % 2 === 0 ? ['typescript', 'swc'] : ['swc', 'typescript'];
    for (const backend of order) {
      const start = performance.now();
      const result = await findJsx(project, { ...query, discovery: backend });
      const elapsed = performance.now() - start;
      assert.deepEqual(result, baseline);
      if (round >= 0) samples[backend].push(elapsed);
    }
  }
  const manifest = JSON.parse(
    fs.readFileSync(findPackageJSON('@swc-next/core', import.meta.url), 'utf8')
  );
  console.log(
    JSON.stringify(
      {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        swcNextVersion: manifest.version,
        workload: {
          sourceFiles: files + 1,
          jsxCallSites: files * perFile,
          returnedPageSize: candidate.matches.length,
        },
        iterations,
        warmupsPerBackend: 3,
        alternatingOrder: true,
        parity: true,
        swcFallbackFiles: discovery.fallbackFiles.length,
        scope:
          'Warm in-process findJsx API queries: discovery, validated filesystem reads, fresh TypeScript Program/checker, prop evaluation, import resolution and pagination. Excludes process startup, native module loading and MCP transport.',
        results: { typescript: statistics(samples.typescript), swc: statistics(samples.swc) },
      },
      null,
      2
    )
  );
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
