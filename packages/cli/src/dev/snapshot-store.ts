import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface StoredDevtoolsGraphSnapshot {
  readonly schemaVersion: number
  readonly nodes: readonly unknown[]
  readonly edges: readonly unknown[]
  readonly diagnostics: readonly unknown[]
}

export interface DevtoolsGraphSnapshotSummary {
  readonly id: string
  readonly createdAt: string
  readonly sourceRevision: number
  readonly name?: string
}

export interface DevtoolsGraphSnapshotRecord extends DevtoolsGraphSnapshotSummary {
  readonly snapshot: StoredDevtoolsGraphSnapshot
}

export interface DevtoolsGraphSnapshotState {
  readonly snapshots: readonly DevtoolsGraphSnapshotSummary[]
  readonly activeBaseSnapshotId?: string
}

interface SnapshotStateFile {
  readonly version: 1
  readonly snapshots: readonly DevtoolsGraphSnapshotSummary[]
  readonly activeBaseSnapshotId?: string
}

interface CreateSnapshotOptions {
  readonly sourceRevision: number
  readonly name?: string
  readonly setAsBase?: boolean
}

const emptyState: SnapshotStateFile = {
  version: 1,
  snapshots: [],
}

export class DevtoolsGraphSnapshotStore {
  readonly #directory: string
  readonly #snapshotsDirectory: string
  readonly #statePath: string

  constructor(projectRoot: string) {
    this.#directory = join(projectRoot, '.loutre', 'devtools')
    this.#snapshotsDirectory = join(this.#directory, 'snapshots')
    this.#statePath = join(this.#directory, 'state.json')
  }

  async list(): Promise<DevtoolsGraphSnapshotState> {
    const state = await this.#readState()
    return {
      snapshots: state.snapshots,
      ...(state.activeBaseSnapshotId === undefined
        ? {}
        : { activeBaseSnapshotId: state.activeBaseSnapshotId }),
    }
  }

  async get(id: string): Promise<DevtoolsGraphSnapshotRecord> {
    this.#assertSnapshotId(id)
    const state = await this.#readState()
    const metadata = state.snapshots.find((snapshot) => snapshot.id === id)
    if (!metadata) throw new Error('Graph Snapshot not found.')

    let parsed: unknown
    try {
      parsed = JSON.parse(await readFile(this.#snapshotPath(id), 'utf8'))
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        throw new Error('Graph Snapshot file is missing.', { cause: error })
      }
      throw error
    }
    if (!isStoredGraphSnapshot(parsed)) {
      throw new Error('Graph Snapshot file is invalid.')
    }
    return { ...metadata, snapshot: parsed }
  }

  async create(
    snapshot: StoredDevtoolsGraphSnapshot,
    options: CreateSnapshotOptions,
  ): Promise<DevtoolsGraphSnapshotRecord> {
    const id = `snapshot_${randomUUID()}`
    const metadata: DevtoolsGraphSnapshotSummary = {
      id,
      createdAt: new Date().toISOString(),
      sourceRevision: options.sourceRevision,
      ...(options.name?.trim() ? { name: options.name.trim() } : {}),
    }

    await mkdir(this.#snapshotsDirectory, { recursive: true })
    await this.#writeJsonAtomic(this.#snapshotPath(id), snapshot)

    const current = await this.#readState()
    const next: SnapshotStateFile = {
      version: 1,
      snapshots: [metadata, ...current.snapshots],
      ...(options.setAsBase
        ? { activeBaseSnapshotId: id }
        : current.activeBaseSnapshotId === undefined
          ? {}
          : { activeBaseSnapshotId: current.activeBaseSnapshotId }),
    }
    await this.#writeState(next)
    return { ...metadata, snapshot }
  }

  async rename(
    id: string,
    name: string | undefined,
  ): Promise<DevtoolsGraphSnapshotSummary> {
    this.#assertSnapshotId(id)
    const current = await this.#readState()
    const index = current.snapshots.findIndex((snapshot) => snapshot.id === id)
    if (index < 0) throw new Error('Graph Snapshot not found.')
    const existing = current.snapshots[index]!
    const trimmed = name?.trim()
    const updated: DevtoolsGraphSnapshotSummary = {
      id: existing.id,
      createdAt: existing.createdAt,
      sourceRevision: existing.sourceRevision,
      ...(trimmed ? { name: trimmed } : {}),
    }
    const snapshots = [...current.snapshots]
    snapshots[index] = updated
    await this.#writeState({ ...current, snapshots })
    return updated
  }

  async delete(id: string): Promise<DevtoolsGraphSnapshotState> {
    this.#assertSnapshotId(id)
    const current = await this.#readState()
    if (!current.snapshots.some((snapshot) => snapshot.id === id)) {
      throw new Error('Graph Snapshot not found.')
    }

    await rm(this.#snapshotPath(id), { force: true })
    const next: SnapshotStateFile = {
      version: 1,
      snapshots: current.snapshots.filter((snapshot) => snapshot.id !== id),
      ...(current.activeBaseSnapshotId === id ||
      current.activeBaseSnapshotId === undefined
        ? {}
        : { activeBaseSnapshotId: current.activeBaseSnapshotId }),
    }
    await this.#writeState(next)
    return this.list()
  }

  async setBase(
    snapshotId: string | undefined,
  ): Promise<DevtoolsGraphSnapshotState> {
    const current = await this.#readState()
    if (snapshotId !== undefined) {
      this.#assertSnapshotId(snapshotId)
      if (!current.snapshots.some((snapshot) => snapshot.id === snapshotId)) {
        throw new Error('Graph Snapshot not found.')
      }
    }
    await this.#writeState({
      version: 1,
      snapshots: current.snapshots,
      ...(snapshotId === undefined ? {} : { activeBaseSnapshotId: snapshotId }),
    })
    return this.list()
  }

  async base(): Promise<DevtoolsGraphSnapshotRecord | undefined> {
    const state = await this.#readState()
    return state.activeBaseSnapshotId === undefined
      ? undefined
      : this.get(state.activeBaseSnapshotId)
  }

  async #readState(): Promise<SnapshotStateFile> {
    let parsed: unknown
    try {
      parsed = JSON.parse(await readFile(this.#statePath, 'utf8'))
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') return emptyState
      throw error
    }

    if (!isSnapshotStateFile(parsed)) {
      throw new Error('Loutre DevTools snapshot state is invalid.')
    }
    return parsed
  }

  async #writeState(state: SnapshotStateFile): Promise<void> {
    await mkdir(this.#directory, { recursive: true })
    await this.#writeJsonAtomic(this.#statePath, state)
  }

  async #writeJsonAtomic(path: string, value: unknown): Promise<void> {
    const temporary = `${path}.${randomUUID()}.tmp`
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
    try {
      await rename(temporary, path)
    } catch (error) {
      await rm(temporary, { force: true })
      throw error
    }
  }

  #snapshotPath(id: string): string {
    return join(this.#snapshotsDirectory, `${id}.json`)
  }

  #assertSnapshotId(id: string): void {
    if (!/^snapshot_[0-9a-f-]{36}$/.test(id)) {
      throw new Error('Invalid Graph Snapshot id.')
    }
  }
}

function isSnapshotStateFile(value: unknown): value is SnapshotStateFile {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !Array.isArray(value.snapshots)
  ) {
    return false
  }
  if (
    value.activeBaseSnapshotId !== undefined &&
    typeof value.activeBaseSnapshotId !== 'string'
  ) {
    return false
  }
  return value.snapshots.every(
    (snapshot) =>
      isRecord(snapshot) &&
      typeof snapshot.id === 'string' &&
      typeof snapshot.createdAt === 'string' &&
      typeof snapshot.sourceRevision === 'number' &&
      (snapshot.name === undefined || typeof snapshot.name === 'string'),
  )
}

function isStoredGraphSnapshot(
  value: unknown,
): value is StoredDevtoolsGraphSnapshot {
  return (
    isRecord(value) &&
    typeof value.schemaVersion === 'number' &&
    Array.isArray(value.nodes) &&
    Array.isArray(value.edges) &&
    Array.isArray(value.diagnostics)
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
