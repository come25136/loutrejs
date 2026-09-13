export interface SourceLocation {
  readonly file: string
  readonly line?: number
  readonly column?: number
}

const sourceMetadata = new WeakMap<object, SourceLocation>()

function asObject(value: unknown): object | undefined {
  return (typeof value === 'object' && value !== null) ||
    typeof value === 'function'
    ? (value as object)
    : undefined
}

function snapshotSourceLocation(source: SourceLocation): SourceLocation {
  return Object.freeze({
    file: source.file,
    ...(source.line === undefined ? {} : { line: source.line }),
    ...(source.column === undefined ? {} : { column: source.column }),
  })
}

export function registerSourceLocation<T>(value: T, source: SourceLocation): T {
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
