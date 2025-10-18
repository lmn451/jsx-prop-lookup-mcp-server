/**
 * Runtime safety utilities for type-safe code execution.
 * Provides guards, assertions, and error conversion functions.
 */

import {
  BaseError,
  UnreachableCaseError,
  ValidationError,
  type DiscriminatedError,
} from "../types/safety.js";

/**
 * Type guard for non-nullish values.
 */
export function isNonNullish<T>(v: T): v is NonNullable<T> {
  return v !== null && v !== undefined;
}

/**
 * Type guard for nullish values.
 */
export function isNullish<T>(v: T): v is Extract<T, null | undefined> {
  return v === null || v === undefined;
}

/**
 * Assertion function to narrow type to non-nullish.
 * Throws if value is nullish.
 */
export function assertNonNullish<T>(
  v: T,
  msg: string = "Expected value to be non-nullish"
): asserts v is NonNullable<T> {
  if (v === null || v === undefined) {
    throw new ValidationError(msg);
  }
}

/**
 * Safely access array element with bounds checking.
 * Returns undefined if index is out of bounds.
 */
export function at<T>(arr: readonly T[], i: number): T | undefined {
  return Number.isInteger(i) && i >= 0 && i < arr.length ? arr[i] : undefined;
}

/**
 * Check if index is valid for array.
 */
export function hasIndex<T>(arr: readonly T[], i: number): boolean {
  return Number.isInteger(i) && i >= 0 && i < arr.length;
}

/**
 * Exhaustiveness check for unreachable code paths.
 * Use in default cases of switch statements to ensure all cases are handled.
 */
export function exhaustive(x: never): never {
  throw new UnreachableCaseError(x);
}

/**
 * Type guard for object property existence using hasOwnProperty.
 */
export function hasOwn<T extends object, K extends PropertyKey>(
  obj: T,
  key: K
): key is K & keyof T {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/**
 * Safely get property from object with index signature.
 */
export function getProperty<T extends object>(
  obj: T,
  key: PropertyKey
): unknown {
  if (hasOwn(obj, key)) {
    return obj[key as keyof T];
  }
  return undefined;
}

/**
 * Convert unknown error to typed BaseError.
 * Handles Error instances, strings, and arbitrary values.
 */
export function asError(e: unknown, type: string = "UnknownError"): BaseError {
  if (e instanceof BaseError) {
    return e;
  }
  if (e instanceof Error) {
    return new BaseError(type, e.message);
  }
  if (typeof e === "string") {
    return new BaseError(type, e);
  }
  try {
    return new BaseError(type, JSON.stringify(e));
  } catch {
    return new BaseError(type, String(e));
  }
}

/**
 * Validate that a value is a non-empty string.
 */
export function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

/**
 * Validate that a value is a non-empty string, throw if not.
 */
export function assertNonEmptyString(
  v: unknown,
  name: string = "value"
): asserts v is string {
  if (!isNonEmptyString(v)) {
    throw new ValidationError(`${name} must be a non-empty string`);
  }
}

/**
 * Safe JSON parse returning discriminated result.
 */
export function safeJsonParse(
  text: string
): { ok: true; value: unknown } | { ok: false; error: BaseError } {
  try {
    const value = JSON.parse(text);
    return { ok: true, value };
  } catch (e: unknown) {
    return { ok: false, error: asError(e, "JSONParseError") };
  }
}

/**
 * Safe JSON stringify with error handling.
 */
export function safeJsonStringify(
  value: unknown,
  fallback: string = "{}"
): string {
  try {
    return JSON.stringify(value);
  } catch {
    return fallback;
  }
}

/**
 * Type guard: check if error is specific BaseError subclass.
 */
export function isErrorOfType<T extends BaseError>(
  e: unknown,
  type: { new (...args: unknown[]): T }
): e is T {
  return e instanceof type;
}

/**
 * Check if error has a specific discriminator type string.
 */
export function hasErrorType(e: unknown, type: string): boolean {
  if (typeof e === "object" && e !== null && "type" in e) {
    return (e as DiscriminatedError).type === type;
  }
  return false;
}
