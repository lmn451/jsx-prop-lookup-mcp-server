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
  const projects = {
    typescript: new ProjectWorkspace({ root }),
    swc: new ProjectWorkspace({ root }),
  };
  const query = { component: 'Button', source: './Button', limit: 500 };
  const baseline = await findJsx(projects.typescript, query);
  const candidate = await findJsx(projects.swc, { ...query, discovery: 'swc' });
  assert.deepEqual(candidate, baseline);
  assert.equal(candidate.total, files * perFile);
  assert.equal(candidate.complete, true);
  const snapshot = await createJsxSnapshot(projects.swc);
  const discovery = collectJsxWithSwc(snapshot);
  assert.equal(discovery.fallbackFiles.length, 0);
  const samples = { typescript: [], swc: [] };
  for (let round = -3; round < iterations; round++) {
    const order = round % 2 === 0 ? ['typescript', 'swc'] : ['swc', 'typescript'];
    for (const backend of order) {
      const start = performance.now();
      const result = await findJsx(projects[backend], { ...query, discovery: backend });
      const elapsed = performance.now() - start;
      assert.deepEqual(result, baseline);
      if (round >= 0) samples[backend].push(elapsed);
    }
  }
  const freshSamples = { typescript: [], swc: [] };
  for (let round = 0; round < iterations; round++) {
    const order = round % 2 === 0 ? ['typescript', 'swc'] : ['swc', 'typescript'];
    for (const backend of order) {
      const fresh = new ProjectWorkspace({ root });
      const start = performance.now();
      const result = await findJsx(fresh, { ...query, discovery: backend });
      freshSamples[backend].push(performance.now() - start);
      assert.deepEqual(result, baseline);
    }
  }
  const nextSnapshot = await createJsxSnapshot(projects.swc);
  const nextDiscovery = collectJsxWithSwc(nextSnapshot);
  assert.equal(nextDiscovery.parsedFiles, 0);
  assert.equal(nextDiscovery.reusedFiles, files + 1);
  assert.ok(nextSnapshot.files.every((source, index) => source === snapshot.files[index]));
  assert.notEqual(nextSnapshot.program, snapshot.program);
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
          'Warm-process findJsx API queries with independent per-backend workspaces: validated source reads, fresh Programs/resolutions, semantics and pagination. results reuse unchanged syntax; freshWorkspaceResults create a new workspace for each query and include initial parsing. Excludes process startup, first native module load, cold OS filesystem caches and MCP transport.',
        results: { typescript: statistics(samples.typescript), swc: statistics(samples.swc) },
        freshWorkspaceResults: {
          typescript: statistics(freshSamples.typescript),
          swc: statistics(freshSamples.swc),
        },
        reuseAudit: {
          sameSourceFiles: true,
          freshPrograms: true,
          swcParsedFiles: nextDiscovery.parsedFiles,
          swcReusedFiles: nextDiscovery.reusedFiles,
        },
      },
      null,
      2
    )
  );
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
