export interface SourceLocation {
  readonly file: string
  readonly line?: number
  readonly column?: number
}

interface SourceMetadata {
  readonly source?: SourceLocation
  readonly members?: ReadonlyMap<string, SourceLocation>
}

const sourceMetadata = new WeakMap<object, SourceMetadata>()

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
  if (!target) return value
  const current = sourceMetadata.get(target)
  sourceMetadata.set(target, {
    ...(current?.members === undefined ? {} : { members: current.members }),
    source: snapshotSourceLocation(source),
  })
  return value
}

export function registerSourceMemberLocation<T>(
  value: T,
  member: string,
  source: SourceLocation,
): T {
  const target = asObject(value)
  if (!target) return value
  const current = sourceMetadata.get(target)
  const members = new Map(current?.members)
  members.set(member, snapshotSourceLocation(source))
  sourceMetadata.set(target, {
    ...(current?.source === undefined ? {} : { source: current.source }),
    members,
  })
  return value
}

export function getSourceLocation(value: unknown): SourceLocation | undefined {
  const target = asObject(value)
  return target ? sourceMetadata.get(target)?.source : undefined
}

export function getSourceMemberLocation(
  value: unknown,
  member: string,
): SourceLocation | undefined {
  const target = asObject(value)
  return target ? sourceMetadata.get(target)?.members?.get(member) : undefined
}

export function inheritSourceLocation<T>(target: T, source: unknown): T {
  const location = getSourceLocation(source)
  return location === undefined
    ? target
    : registerSourceLocation(target, location)
}
