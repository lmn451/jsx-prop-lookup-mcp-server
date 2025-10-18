/**
 * Safe property access for objects with index signatures.
 * Works with noPropertyAccessFromIndexSignature and exactOptionalPropertyTypes.
 */

export function getProperty<T extends object, K extends PropertyKey>(
  obj: T,
  key: K
): unknown {
  return (obj as Record<string, unknown>)[String(key)];
}

export function setProperty<T extends object, K extends PropertyKey>(
  obj: T,
  key: K,
  value: unknown
): void {
  (obj as Record<string, unknown>)[String(key)] = value;
}

export function hasProperty<T extends object, K extends PropertyKey>(
  obj: T,
  key: K
): boolean {
  return Object.prototype.hasOwnProperty.call(obj, String(key));
}

export function getString<T extends object, K extends PropertyKey>(
  obj: T,
  key: K,
  defaultValue: string = ""
): string {
  const val = (obj as Record<string, unknown>)[String(key)];
  return typeof val === "string" ? val : defaultValue;
}

export function getNumber<T extends object, K extends PropertyKey>(
  obj: T,
  key: K,
  defaultValue: number = 0
): number {
  const val = (obj as Record<string, unknown>)[String(key)];
  return typeof val === "number" ? val : defaultValue;
}

export function getObject<T extends object, K extends PropertyKey>(
  obj: T,
  key: K
): Record<string, unknown> | null {
  const val = (obj as Record<string, unknown>)[String(key)];
  return typeof val === "object" && val !== null ? (val as Record<string, unknown>) : null;
}

export function getArray<T extends object, K extends PropertyKey>(
  obj: T,
  key: K
): readonly unknown[] {
  const val = (obj as Record<string, unknown>)[String(key)];
  return Array.isArray(val) ? val : [];
}
