import type { Diagnostic } from './diagnostic.js'
import type { TokenLike } from './token.js'

declare const runtimeCapabilityValue: unique symbol
declare const executionExtensionTypeInfo: unique symbol
const executionExtensionIdentityNamespace = 'loutre.execution-extension:'
const runtimeCapabilityIdentityNamespace = 'loutre.runtime-capability:'

export interface RuntimeCapability<TValue = unknown> {
  readonly kind: 'runtime-capability'
  readonly id: string
  readonly identity: symbol
  readonly [runtimeCapabilityValue]?: TValue
}

export type RuntimeCapabilityValue<TCapability> =
  TCapability extends RuntimeCapability<infer TValue> ? TValue : never

export function runtimeCapability<TValue>(
  id: string,
): RuntimeCapability<TValue> {
  if (id.trim().length === 0) {
    throw new Error('LUTRE_CAPABILITY_ID: Capability id must not be empty.')
  }
  return Object.freeze({
    kind: 'runtime-capability' as const,
    id,
    identity: Symbol.for(`${runtimeCapabilityIdentityNamespace}${id}`),
  })
}

export interface RuntimeCapabilityBindings {
  has(capability: RuntimeCapability<any>): boolean
  get<TValue>(capability: RuntimeCapability<TValue>): TValue
}

export interface RuntimeCapabilityBinding<TValue = unknown> {
  readonly capability: RuntimeCapability<TValue>
  readonly value: TValue
}

export function bindRuntimeCapability<TValue>(
  capability: RuntimeCapability<TValue>,
  value: TValue,
): RuntimeCapabilityBinding<TValue> {
  return Object.freeze({ capability, value })
}

export class RuntimeCapabilityRegistry implements RuntimeCapabilityBindings {
  readonly #values = new Map<symbol, unknown>()
  readonly #capabilities = new Map<symbol, RuntimeCapability<any>>()

  constructor(bindings: Iterable<RuntimeCapabilityBinding> = []) {
    for (const binding of bindings) {
      const identity = binding.capability.identity
      const existing = this.#capabilities.get(identity)
      if (existing && existing.id !== binding.capability.id) {
        throw new Error(
          `LUTRE_CAPABILITY_ID_COLLISION: ${binding.capability.id}`,
        )
      }
      if (this.#values.has(identity)) {
        throw new Error(
          `LUTRE_CAPABILITY_DUPLICATE_BINDING: ${binding.capability.id}`,
        )
      }
      this.#capabilities.set(identity, binding.capability)
      this.#values.set(identity, binding.value)
    }
  }

  has(capability: RuntimeCapability<any>): boolean {
    return this.#values.has(capability.identity)
  }

  get<TValue>(capability: RuntimeCapability<TValue>): TValue {
    if (!this.#values.has(capability.identity)) {
      throw new Error(`LUTRE_CAPABILITY_MISSING: ${capability.id}`)
    }
    return this.#values.get(capability.identity) as TValue
  }
}

export interface ExecutionLease {
  readonly signal: AbortSignal
  abort(reason?: unknown): void
  complete(): void
}

export interface ExecutionKernelRuntime {
  beginExecution(): ExecutionLease
  resolve<TValue>(token: TokenLike<TValue>, source?: string): TValue
}

export interface ExecutionExtensionRuntime {
  drain?(): void | Promise<void>
  close?(): void | Promise<void>
}

export interface ExecutionCompileContext {
  readonly moduleId: string
  readonly definitionIndex: number
}

export interface ExecutionContribution<TCompiled = unknown> {
  readonly kind: 'execution'
  readonly id: string
  readonly executionKind: string
  readonly dependencies: readonly TokenLike[]
  readonly capabilities: readonly RuntimeCapability[]
  readonly compiled: TCompiled
}

export interface ExecutionExtensionValidationContext<TCompiled = unknown> {
  readonly executions: readonly ExecutionContribution<TCompiled>[]
}

export interface ExecutionProjectionContext<TCompiled = unknown> {
  readonly execution: ExecutionContribution<TCompiled>
}

export interface ExecutionExtensionRuntimeContext<TCompiled = unknown> {
  readonly executions: readonly ExecutionContribution<TCompiled>[]
  readonly capabilities: RuntimeCapabilityBindings
  readonly applicationRuntime: ExecutionKernelRuntime
}

export interface HostExtensionContext<
  TCompiled = unknown,
  TRuntime extends ExecutionExtensionRuntime = ExecutionExtensionRuntime,
> {
  readonly executions: readonly ExecutionContribution<TCompiled>[]
  readonly runtime: TRuntime
  readonly applicationRuntime: ExecutionKernelRuntime
}

export interface HostExtension<
  TNamespace extends string = string,
  TApi extends object = object,
  TCompiled = unknown,
  TRuntime extends ExecutionExtensionRuntime = ExecutionExtensionRuntime,
> {
  readonly namespace: TNamespace
  create(context: HostExtensionContext<TCompiled, TRuntime>): TApi
}

export interface ExecutionExtension<
  TDefinition extends ExecutionDefinition<any> = ExecutionDefinition<any>,
  TCompiled = unknown,
  TNamespace extends string = string,
  THostApi extends object = object,
  TRuntime extends ExecutionExtensionRuntime = ExecutionExtensionRuntime,
> {
  readonly kind: 'execution-extension'
  readonly name: string
  readonly identity: symbol
  readonly [executionExtensionTypeInfo]?: readonly [TNamespace, THostApi]
  compile(
    definition: TDefinition,
    context: ExecutionCompileContext,
  ): ExecutionContribution<TCompiled>
  references?(definition: TDefinition): readonly ExecutionDefinition[]
  validate?(
    context: ExecutionExtensionValidationContext<TCompiled>,
  ): readonly Diagnostic[]
  createRuntime(
    context: ExecutionExtensionRuntimeContext<TCompiled>,
  ): TRuntime | Promise<TRuntime>
  projectGraph?(context: ExecutionProjectionContext<TCompiled>): unknown
  readonly host?: HostExtension<TNamespace, THostApi, TCompiled, TRuntime>
}

export function defineExecutionExtension<
  const TDefinition extends ExecutionDefinition,
  TCompiled,
  const TNamespace extends string = never,
  THostApi extends object = {},
  TRuntime extends ExecutionExtensionRuntime = ExecutionExtensionRuntime,
>(
  extension: Omit<
    ExecutionExtension<TDefinition, TCompiled, TNamespace, THostApi, TRuntime>,
    'identity'
  >,
): ExecutionExtension<TDefinition, TCompiled, TNamespace, THostApi, TRuntime> {
  return Object.freeze({
    ...extension,
    ...(extension.host === undefined
      ? {}
      : { host: Object.freeze({ ...extension.host }) }),
    identity: Symbol.for(
      `${executionExtensionIdentityNamespace}${extension.name}`,
    ),
  })
}

export const executionDefinitionBrand: unique symbol = Symbol.for(
  'loutre.execution-definition',
) as typeof executionDefinitionBrand

export interface ExecutionDefinition<
  TExtension extends AnyExecutionExtension = AnyExecutionExtension,
> {
  readonly kind: 'execution-definition'
  readonly extension: TExtension
  readonly [executionDefinitionBrand]: true
}

export function defineExecution<
  const TExtension extends ExecutionExtension,
  const TDefinition extends object,
>(
  extension: TExtension,
  definition: TDefinition,
): Readonly<TDefinition & ExecutionDefinition<TExtension>> {
  return Object.freeze({
    ...definition,
    kind: 'execution-definition' as const,
    extension,
    [executionDefinitionBrand]: true as const,
  })
}

export function isExecutionDefinition(
  value: unknown,
): value is ExecutionDefinition {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Partial<ExecutionDefinition>).kind === 'execution-definition' &&
    executionDefinitionBrand in value &&
    value[executionDefinitionBrand] === true
  )
}

export type ExtensionOfDefinition<TDefinition> = TDefinition extends {
  readonly extension: infer TExtension extends AnyExecutionExtension
}
  ? TExtension
  : never

export type AnyExecutionExtension = ExecutionExtension<any, any, any, any, any>

export type HostApiOfExtension<TExtension> = TExtension extends {
  readonly host?: infer THost
}
  ? NonNullable<THost> extends HostExtension<
      infer TNamespace,
      infer THostApi,
      any,
      any
    >
    ? [TNamespace] extends [never]
      ? {}
      : { readonly [K in TNamespace]: THostApi }
    : {}
  : {}
