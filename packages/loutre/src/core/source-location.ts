import type { Brand } from '../internal/brand.js'
export type SourceFileReference = Brand<string, 'source.file-reference'>
export type SourceLine = Brand<number, 'source.line'>
export type SourceColumn = Brand<number, 'source.column'>
export const sourceFileReference = (value: string): SourceFileReference =>
  value as SourceFileReference
export const sourceLine = (value: number): SourceLine => value as SourceLine
export const sourceColumn = (value: number): SourceColumn =>
  value as SourceColumn

export interface SourceLocationInput {
  readonly file: string
  readonly line?: number
  readonly column?: number
}

export interface SourceLocation {
  readonly file: SourceFileReference
  readonly line?: SourceLine
  readonly column?: SourceColumn
}

const sourceMetadata = new WeakMap<object, SourceLocation>()

function asObject(value: unknown): object | undefined {
  return (typeof value === 'object' && value !== null) ||
    typeof value === 'function'
    ? (value as object)
    : undefined
}

function snapshotSourceLocation(source: SourceLocationInput): SourceLocation {
  return Object.freeze({
    file: sourceFileReference(source.file),
    ...(source.line === undefined ? {} : { line: sourceLine(source.line) }),
    ...(source.column === undefined
      ? {}
      : { column: sourceColumn(source.column) }),
  })
}

export function registerSourceLocation<T>(
  value: T,
  source: SourceLocationInput,
): T {
  const target = asObject(value)
  if (!target || sourceMetadata.has(target)) return value
  sourceMetadata.set(target, snapshotSourceLocation(source))
  return value
}

export function getSourceLocation(value: unknown): SourceLocation | undefined {
  const target = asObject(value)
  return target ? sourceMetadata.get(target) : undefined
}

export function inheritSourceLocation<T>(target: T, source: unknown): T {
  const location = getSourceLocation(source)
  return location === undefined
    ? target
    : registerSourceLocation(target, location)
}
