import type { RuntimeExecutionMetadata } from '../core/instrumentation.js'
import type { DevtoolsModuleOptions } from './module.js'
import { serializeDevtoolsError } from './observer.js'
import type {
  ReplayCapsuleRequest,
  ReplayExecutionContext,
  RuntimeInvocationResult,
} from './inspector.js'
import { previewDevtoolsValue, type DevtoolsValuePreview } from './values.js'

export interface ReplayRegistration {
  readonly input: unknown
  replay(
    input: unknown,
    context: ReplayExecutionContext,
  ): unknown | Promise<unknown>
}

export type CapturedValue =
  | { readonly mode: 'snapshot'; readonly value: unknown }
  | { readonly mode: 'reference'; readonly handleId: string }
  | { readonly mode: 'unavailable'; readonly reason: string }

export interface ExecutionReplayCapsulePreview {
  readonly id: string
  readonly kind: 'execution'
  readonly runId: string
  readonly traceId: string
  readonly spanId: string
  readonly createdAt: number
  readonly expiresAt: number
  readonly execution: {
    readonly executionId: string
    readonly executionKind: string
    readonly graphNodeId?: string
    readonly name: string
  }
  readonly input: DevtoolsValuePreview
  readonly fidelity: 'snapshot' | 'reference' | 'unavailable'
  readonly replayModes: readonly ['direct']
}

interface StoredExecutionReplayCapsule {
  readonly preview: ExecutionReplayCapsulePreview
  readonly captured: CapturedValue
  readonly replay: ReplayRegistration['replay']
}

export interface ReplayCapsuleStoreOptions {
  readonly ttlMs?: number
  readonly maxCapsules?: number
  readonly capture?: DevtoolsModuleOptions['capture']
  readonly redact?: readonly string[]
}

const defaultCapsuleTtlMs = 5 * 60_000
const defaultMaxCapsules = 1_000

export class ReplayCapsuleStore {
  readonly #runId: string
  readonly #ttlMs: number
  readonly #maxCapsules: number
  readonly #capture: DevtoolsModuleOptions['capture']
  readonly #redact: readonly string[]
  readonly #capsules = new Map<string, StoredExecutionReplayCapsule>()
  readonly #references = new Map<string, unknown>()

  constructor(runId: string, options: ReplayCapsuleStoreOptions = {}) {
    this.#runId = runId
    this.#ttlMs = options.ttlMs ?? defaultCapsuleTtlMs
    this.#maxCapsules = options.maxCapsules ?? defaultMaxCapsules
    this.#capture = options.capture
    this.#redact = options.redact ?? []
    if (!Number.isFinite(this.#ttlMs) || this.#ttlMs <= 0) {
      throw new TypeError('capsuleTtlMs must be a positive finite number.')
    }
    if (!Number.isInteger(this.#maxCapsules) || this.#maxCapsules < 1) {
      throw new TypeError('maxCapsules must be a positive integer.')
    }
  }

  createExecution(
    traceId: string,
    spanId: string,
    observation: RuntimeExecutionMetadata,
    registration: ReplayRegistration,
  ): ExecutionReplayCapsulePreview {
    this.#purgeExpired()
    const id = `capsule_${crypto.randomUUID()}`
    const createdAt = Date.now()
    const captured = this.#captureValue(registration.input)
    const preview: ExecutionReplayCapsulePreview = {
      id,
      kind: 'execution',
      runId: this.#runId,
      traceId,
      spanId,
      createdAt,
      expiresAt: createdAt + this.#ttlMs,
      execution: {
        executionId: observation.executionId,
        executionKind: observation.executionKind,
        name: observation.name ?? observation.executionId,
        ...(observation.graphNodeId === undefined
          ? {}
          : { graphNodeId: observation.graphNodeId }),
      },
      input: previewDevtoolsValue(registration.input, {
        ...(this.#capture?.maxValueBytes === undefined
          ? {}
          : { maxValueBytes: this.#capture.maxValueBytes }),
        ...(this.#capture?.maxDepth === undefined
          ? {}
          : { maxDepth: this.#capture.maxDepth }),
        redact: this.#redact,
      }),
      fidelity: captured.mode,
      replayModes: ['direct'],
    }
    this.#capsules.set(id, { preview, captured, replay: registration.replay })
    while (this.#capsules.size > this.#maxCapsules) {
      const oldest = this.#capsules.keys().next().value as string | undefined
      if (!oldest) break
      this.#delete(oldest)
    }
    return preview
  }

  preview(capsuleId: string): ExecutionReplayCapsulePreview | undefined {
    this.#purgeExpired()
    return this.#capsules.get(capsuleId)?.preview
  }

  async replay(
    request: ReplayCapsuleRequest,
  ): Promise<RuntimeInvocationResult> {
    this.#purgeExpired()
    const capsule = this.#capsules.get(request.capsuleId)
    if (!capsule) {
      return {
        requestId: request.requestId,
        status: 'error',
        error: {
          name: 'ReplayCapsuleUnavailableError',
          message: `LUTRE_DEVTOOLS_CAPSULE_UNAVAILABLE: ${request.capsuleId}`,
        },
      }
    }

    let input: unknown
    try {
      input =
        'inputOverride' in request
          ? request.inputOverride
          : this.#restore(capsule.captured)
    } catch (error) {
      return {
        requestId: request.requestId,
        status: 'error',
        error: serializeDevtoolsError(error),
      }
    }

    const context: ReplayExecutionContext = {
      sourceTraceId: capsule.preview.traceId,
      sourceCapsuleId: capsule.preview.id,
      ...(request.parentTraceId === undefined
        ? {}
        : { parentTraceId: request.parentTraceId }),
    }
    try {
      const result = await capsule.replay(input, context)
      return {
        requestId: request.requestId,
        status: 'ok',
        result: previewDevtoolsValue(result, {
          ...(this.#capture?.maxValueBytes === undefined
            ? {}
            : { maxValueBytes: this.#capture.maxValueBytes }),
          ...(this.#capture?.maxDepth === undefined
            ? {}
            : { maxDepth: this.#capture.maxDepth }),
          redact: this.#redact,
        }),
      }
    } catch (error) {
      return {
        requestId: request.requestId,
        status: 'error',
        error: serializeDevtoolsError(error),
      }
    }
  }

  discard(capsuleId: string): void {
    this.#delete(capsuleId)
  }

  clear(): void {
    this.#capsules.clear()
    this.#references.clear()
  }

  #captureValue(value: unknown): CapturedValue {
    try {
      if (isSnapshotCandidate(value)) {
        return { mode: 'snapshot', value: structuredClone(value) }
      }
    } catch {
      // Fall through to a live reference when inspection or cloning is unsafe.
    }
    if (value !== undefined) {
      const handleId = `ref_${crypto.randomUUID()}`
      this.#references.set(handleId, value)
      return { mode: 'reference', handleId }
    }
    return { mode: 'snapshot', value: undefined }
  }

  #restore(captured: CapturedValue): unknown {
    switch (captured.mode) {
      case 'snapshot':
        return structuredClone(captured.value)
      case 'reference':
        if (this.#references.has(captured.handleId)) {
          return this.#references.get(captured.handleId)
        }
        throw new Error(
          `LUTRE_DEVTOOLS_REFERENCE_UNAVAILABLE: ${captured.handleId}`,
        )
      case 'unavailable':
        throw new Error(
          `LUTRE_DEVTOOLS_CAPTURE_UNAVAILABLE: ${captured.reason}`,
        )
    }
  }

  #purgeExpired(): void {
    const now = Date.now()
    for (const [id, capsule] of this.#capsules) {
      if (capsule.preview.expiresAt > now) continue
      this.#delete(id)
    }
  }

  #delete(id: string): void {
    const capsule = this.#capsules.get(id)
    if (!capsule) return
    if (capsule.captured.mode === 'reference') {
      this.#references.delete(capsule.captured.handleId)
    }
    this.#capsules.delete(id)
  }
}

function isSnapshotCandidate(
  value: unknown,
  seen = new WeakSet<object>(),
): boolean {
  if (value === null) return true
  if (
    typeof value === 'undefined' ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return true
  }
  if (typeof value !== 'object') return false
  if (seen.has(value)) return true
  seen.add(value)
  try {
    if (
      value instanceof Date ||
      value instanceof ArrayBuffer ||
      ArrayBuffer.isView(value)
    ) {
      return true
    }
    if (Array.isArray(value)) {
      return dataPropertiesAreSnapshotCandidates(value, seen, 'length')
    }
    if (value instanceof Map) {
      for (const [key, item] of Map.prototype.entries.call(value)) {
        if (
          !isSnapshotCandidate(key, seen) ||
          !isSnapshotCandidate(item, seen)
        ) {
          return false
        }
      }
      return true
    }
    if (value instanceof Set) {
      for (const item of Set.prototype.values.call(value)) {
        if (!isSnapshotCandidate(item, seen)) return false
      }
      return true
    }
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) return false
    return dataPropertiesAreSnapshotCandidates(value, seen)
  } finally {
    seen.delete(value)
  }
}

function dataPropertiesAreSnapshotCandidates(
  value: object,
  seen: WeakSet<object>,
  ignoredKey?: PropertyKey,
): boolean {
  const descriptors = Object.getOwnPropertyDescriptors(value)
  for (const key of Reflect.ownKeys(descriptors)) {
    if (key === ignoredKey) continue
    const descriptor = descriptors[key as keyof typeof descriptors]
    if (!descriptor || !('value' in descriptor)) return false
    if (!isSnapshotCandidate(descriptor.value, seen)) return false
  }
  return true
}
