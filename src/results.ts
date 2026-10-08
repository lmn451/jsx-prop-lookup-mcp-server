export interface LocatedResult {
  filePath: string;
  line: number;
  column: number;
  snippet?: string;
}

export interface PageOptions {
  offset?: number;
  limit?: number;
}

export interface UnresolvedCase {
  filePath: string;
  line?: number;
  column?: number;
  reason: string;
}

export interface ResultPage<T extends LocatedResult> {
  matches: T[];
  total: number;
  offset: number;
  limit: number;
  nextOffset: number | null;
  unresolved: UnresolvedCase[];
  complete: boolean;
}

/** Sort and page matches without changing the caller's objects or arrays. */
export function paginateResults<T extends LocatedResult>(
  items: readonly T[],
  options: PageOptions = {},
  unresolved: readonly UnresolvedCase[] = []
): ResultPage<T> {
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new RangeError('limit must be an integer from 1 to 500');
  }
  if (!Number.isInteger(offset) || offset < 0) {
    throw new RangeError('offset must be a non-negative integer');
  }

  const sorted = [...items].sort((left, right) => {
    const leftPath = left.filePath.replaceAll('\\', '/');
    const rightPath = right.filePath.replaceAll('\\', '/');
    if (leftPath < rightPath) return -1;
    if (leftPath > rightPath) return 1;
    return left.line - right.line || left.column - right.column;
  });
  const end = offset + limit;
  return {
    matches: sorted.slice(offset, end),
    total: items.length,
    offset,
    limit,
    nextOffset: end < items.length ? end : null,
    unresolved: [...unresolved],
    complete: unresolved.length === 0,
  };
}

/** A one-based source line, limited to 240 Unicode code points. */
export function sourceSnippet(source: string, line: number, column?: number): string {
  const text = source.split(/\r?\n/)[line - 1] ?? '';
  const points = [...text];
  if (points.length <= 240) return text;
  if (column === undefined) return points.slice(0, 239).join('') + '…';
  const position = [...text.slice(0, column - 1)].length;
  const start = Math.max(0, Math.min(position - 119, points.length - 238));
  const end = Math.min(points.length, start + 238);
  return `${start > 0 ? '…' : ''}${points.slice(start, end).join('')}${end < points.length ? '…' : ''}`;
}
