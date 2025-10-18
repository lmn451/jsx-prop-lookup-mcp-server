/**
 * Safety types for military-grade type safety guarantees.
 * Provides discriminated unions for error handling and result wrapping.
 */

export type Option<T> = T | undefined;
export type Nullable<T> = T | null;
export type Maybe<T> = T | null | undefined;

export type Ok<T> = { readonly ok: true; readonly value: T };
export type Err<E extends BaseError = BaseError> = { readonly ok: false; readonly error: E };
export type Result<T, E extends BaseError = BaseError> = Ok<T> | Err<E>;

export interface DiscriminatedError {
  readonly type: string;
  readonly message: string;
}

/**
 * Base error class with discriminated type field.
 * All domain errors should extend this for exhaustive error handling.
 */
export class BaseError extends Error implements DiscriminatedError {
  readonly type: string;

  constructor(type: string, message: string) {
    super(message);
    this.type = type;
    this.name = type;
    // Maintain prototype chain for instanceof checks
    Object.setPrototypeOf(this, BaseError.prototype);
  }
}

/**
 * Thrown when exhaustive type check reaches an unreachable case.
 */
export class UnreachableCaseError extends BaseError {
  constructor(value: never) {
    super("UnreachableCaseError", `Unreachable case encountered: ${String(value)}`);
    Object.setPrototypeOf(this, UnreachableCaseError.prototype);
  }
}

/**
 * File system or path-related error.
 */
export class FileSystemError extends BaseError {
  constructor(message: string) {
    super("FileSystemError", message);
    Object.setPrototypeOf(this, FileSystemError.prototype);
  }
}

/**
 * Parser or AST analysis error.
 */
export class ParseError extends BaseError {
  constructor(message: string) {
    super("ParseError", message);
    Object.setPrototypeOf(this, ParseError.prototype);
  }
}

/**
 * Analyzer logic error.
 */
export class AnalyzerError extends BaseError {
  constructor(message: string) {
    super("AnalyzerError", message);
    Object.setPrototypeOf(this, AnalyzerError.prototype);
  }
}

/**
 * CLI argument or invocation error.
 */
export class CLIError extends BaseError {
  constructor(message: string) {
    super("CLIError", message);
    Object.setPrototypeOf(this, CLIError.prototype);
  }
}

/**
 * MCP protocol or server error.
 */
export class MCPError extends BaseError {
  constructor(message: string) {
    super("MCPError", message);
    Object.setPrototypeOf(this, MCPError.prototype);
  }
}

/**
 * Validation error for inputs or payloads.
 */
export class ValidationError extends BaseError {
  constructor(message: string) {
    super("ValidationError", message);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}
