import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'tsx/esm/api';

register();
const { paginateResults, sourceSnippet } = await import('../src/results.ts');

// Accepted boundaries: default page below/on/above 100; limit below/on/above
// 1 and 500; offset before/on/after the end; invalid integer assumptions.
// Decision: snippets retain indentation, use one-based lines, and include an
// ellipsis inside the 240-code-point cap. CRLF and LF produce the same line.
const pageSizes = [
  { name: 'empty input', count: 0, expectedCount: 0, nextOffset: null },
  { name: 'below the default page size', count: 99, expectedCount: 99, nextOffset: null },
  { name: 'on the default page size', count: 100, expectedCount: 100, nextOffset: null },
  { name: 'above the default page size', count: 101, expectedCount: 100, nextOffset: 100 },
];

function locations(count) {
  return Array.from({ length: count }, (_, index) => ({
    filePath: 'src/Widget.tsx',
    line: index + 1,
    column: 1,
  }));
}

for (const { name, count, expectedCount, nextOffset } of pageSizes) {
  test(`pagination: ${name}`, () => {
    const input = locations(count);
    const result = paginateResults(input);

    assert.deepEqual(result, {
      matches: input.slice(0, expectedCount),
      total: count,
      offset: 0,
      limit: 100,
      nextOffset,
      unresolved: [],
      complete: true,
    });
  });
}

for (const { limit, label } of [
  { limit: 1, label: 'on the minimum page size' },
  { limit: 2, label: 'above the minimum page size' },
  { limit: 499, label: 'below the maximum page size' },
  { limit: 500, label: 'on the maximum page size' },
]) {
  test(`pagination accepts ${label}`, () => {
    const input = locations(501);
    const result = paginateResults(input, { limit });

    assert.deepEqual(result, {
      matches: input.slice(0, limit),
      total: 501,
      offset: 0,
      limit,
      nextOffset: limit,
      unresolved: [],
      complete: true,
    });
  });
}

for (const { limit, label } of [
  { limit: 0, label: 'below the minimum page size' },
  { limit: -1, label: 'negative page size' },
  { limit: 501, label: 'above the maximum page size' },
  { limit: 1.5, label: 'fractional page size' },
  { limit: NaN, label: 'not-a-number page size' },
  { limit: Infinity, label: 'infinite page size' },
]) {
  test(`pagination rejects ${label}`, () => {
    assert.throws(() => paginateResults([], { limit }), {
      name: 'RangeError',
      message: 'limit must be an integer from 1 to 500',
    });
  });
}

for (const { offset, expectedLines, nextOffset, label } of [
  { offset: 0, expectedLines: [1, 2], nextOffset: 2, label: 'on the first offset' },
  { offset: 1, expectedLines: [2, 3], nextOffset: null, label: 'after the first offset' },
  { offset: 2, expectedLines: [3], nextOffset: null, label: 'before the end' },
  { offset: 3, expectedLines: [], nextOffset: null, label: 'on the end' },
  { offset: 4, expectedLines: [], nextOffset: null, label: 'after the end' },
]) {
  test(`pagination: offset ${label}`, () => {
    const result = paginateResults(locations(3), { offset, limit: 2 });

    assert.deepEqual(result, {
      matches: expectedLines.map((line) => ({ filePath: 'src/Widget.tsx', line, column: 1 })),
      total: 3,
      offset,
      limit: 2,
      nextOffset,
      unresolved: [],
      complete: true,
    });
  });
}

for (const { offset, label } of [
  { offset: -1, label: 'negative offset' },
  { offset: 0.5, label: 'fractional offset' },
  { offset: NaN, label: 'not-a-number offset' },
  { offset: Infinity, label: 'infinite offset' },
]) {
  test(`pagination rejects ${label}`, () => {
    assert.throws(() => paginateResults([], { offset }), {
      name: 'RangeError',
      message: 'offset must be a non-negative integer',
    });
  });
}

test('pagination sorts normalized paths and numeric locations before slicing without mutating input', () => {
  const input = Object.freeze([
    Object.freeze({ filePath: 'B.tsx', line: 1, column: 1, snippet: '<B />', id: 'last-file' }),
    Object.freeze({ filePath: 'A.tsx', line: 10, column: 1, id: 'later-line' }),
    Object.freeze({ filePath: 'A.tsx', line: 2, column: 10, id: 'later-column' }),
    Object.freeze({ filePath: 'A.tsx', line: 2, column: 2, id: 'earlier-column' }),
    Object.freeze({ filePath: 'src\\B.tsx', line: 1, column: 1, id: 'normalized-later' }),
    Object.freeze({ filePath: 'src/A.tsx', line: 1, column: 1, id: 'normalized-earlier' }),
  ]);

  assert.deepEqual(paginateResults(input).matches, [
    input[3],
    input[2],
    input[1],
    input[0],
    input[5],
    input[4],
  ]);
  assert.deepEqual(paginateResults(input, { offset: 1, limit: 2 }).matches, [input[2], input[1]]);
});

test('pagination keeps original order for identical normalized locations', () => {
  const input = [
    { filePath: 'src\\A.tsx', line: 1, column: 2, id: 'first' },
    { filePath: 'src/A.tsx', line: 1, column: 2, id: 'second' },
  ];

  assert.deepEqual(paginateResults(input).matches, input);
});

test('pagination treats a backslash as a path separator when comparing a sibling filename', () => {
  const sibling = { filePath: 'src0.tsx', line: 1, column: 1 };
  const nested = { filePath: 'src\\A.tsx', line: 1, column: 1 };

  assert.deepEqual(paginateResults([sibling, nested]).matches, [nested, sibling]);
});

test('unresolved cases survive pagination and mark the analysis incomplete', () => {
  const unresolved = Object.freeze([
    Object.freeze({ filePath: 'src/Z.tsx', line: 2, column: 1, reason: 'Dynamic spread' }),
    Object.freeze({ filePath: 'src/A.tsx', reason: 'Parse failed' }),
  ]);
  const result = paginateResults(locations(3), { offset: 3, limit: 1 }, unresolved);

  assert.deepEqual(result, {
    matches: [],
    total: 3,
    offset: 3,
    limit: 1,
    nextOffset: null,
    unresolved,
    complete: false,
  });
});

const snippetCases = [
  { name: 'empty source', source: '', line: 1, expected: '' },
  {
    name: 'first line with indentation retained',
    source: '  <Widget />\nsecond',
    line: 1,
    expected: '  <Widget />',
  },
  {
    name: 'last line without a trailing newline',
    source: 'first\n<Widget />',
    line: 2,
    expected: '<Widget />',
  },
  {
    name: 'CRLF line endings',
    source: 'first\r\n  <Widget />\r\nlast',
    line: 2,
    expected: '  <Widget />',
  },
  {
    name: 'LF line endings',
    source: 'first\n  <Widget />\nlast',
    line: 2,
    expected: '  <Widget />',
  },
  { name: 'before the first line', source: 'one\ntwo', line: 0, expected: '' },
  { name: 'negative line', source: 'one\ntwo', line: -1, expected: '' },
  { name: 'after the last line', source: 'one\ntwo', line: 3, expected: '' },
  { name: 'fractional line', source: 'one\ntwo', line: 1.5, expected: '' },
  { name: 'not-a-number line', source: 'one\ntwo', line: NaN, expected: '' },
  { name: 'infinite line', source: 'one\ntwo', line: Infinity, expected: '' },
  { name: 'below the snippet cap', source: 'x'.repeat(239), line: 1, expected: 'x'.repeat(239) },
  { name: 'on the snippet cap', source: 'x'.repeat(240), line: 1, expected: 'x'.repeat(240) },
  {
    name: 'above the snippet cap',
    source: 'x'.repeat(241),
    line: 1,
    expected: 'x'.repeat(239) + '…',
  },
  {
    name: 'unicode below the snippet cap',
    source: '😀'.repeat(239),
    line: 1,
    expected: '😀'.repeat(239),
  },
  {
    name: 'unicode on the snippet cap',
    source: '😀'.repeat(240),
    line: 1,
    expected: '😀'.repeat(240),
  },
  {
    name: 'unicode above the snippet cap',
    source: '😀'.repeat(241),
    line: 1,
    expected: '😀'.repeat(239) + '…',
  },
];

for (const { name, source, line, expected } of snippetCases) {
  test(`source snippet: ${name}`, () => {
    assert.equal(sourceSnippet(source, line), expected);
  });
}
