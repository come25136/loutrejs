import type {
  EntrypointArguments,
  EntrypointDescriptor,
  EntrypointOutput,
  ModuleCapabilities,
  ModuleInstance,
  TriggerDescriptor,
} from '@loutrejs/core'
import type { ApplicationGraphIR } from '@loutrejs/graph'
import type { Logger } from '@loutrejs/runtime'

export interface ApplicationDefinitionOptions<
  TModules extends readonly ModuleInstance[],
  TEntrypoints extends readonly EntrypointDescriptor<any, any>[],
  TTriggers extends readonly TriggerDescriptor[],
> {
  readonly modules: TModules
  readonly entrypoints?: TEntrypoints
  readonly triggers?: TTriggers
  readonly logger?: Logger
}

export interface ApplicationDefinition<
  TModules extends readonly ModuleInstance[] = readonly ModuleInstance[],
  TEntrypoints extends readonly EntrypointDescriptor<any, any>[] =
    readonly EntrypointDescriptor<any, any>[],
  TTriggers extends readonly TriggerDescriptor[] = readonly TriggerDescriptor[],
> {
  readonly kind: 'application-definition'
  readonly modules: TModules
  readonly entrypoints: TEntrypoints
  readonly triggers: TTriggers
  readonly logger?: Logger
}

export function defineApplication<
  const TModules extends readonly ModuleInstance[],
  const TEntrypoints extends readonly EntrypointDescriptor<any, any>[] =
    readonly [],
  const TTriggers extends readonly TriggerDescriptor[] = readonly [],
>(
  options: ApplicationDefinitionOptions<TModules, TEntrypoints, TTriggers>,
): ApplicationDefinition<TModules, TEntrypoints, TTriggers> {
  return Object.freeze({
    kind: 'application-definition',
    modules: options.modules,
    entrypoints: options.entrypoints ?? ([] as unknown as TEntrypoints),
    triggers: options.triggers ?? ([] as unknown as TTriggers),
    ...(options.logger === undefined ? {} : { logger: options.logger }),
  })
}

export type ExplicitEntrypoint<TDefinition extends ApplicationDefinition> =
  TDefinition['entrypoints'][number]

export interface BaseApplication<TDefinition extends ApplicationDefinition> {
  readonly graph: ApplicationGraphIR
  init(): Promise<this>
  run<TEntrypoint extends ExplicitEntrypoint<TDefinition>>(
    entrypoint: TEntrypoint,
    ...args: EntrypointArguments<TEntrypoint>
  ): Promise<EntrypointOutput<TEntrypoint>>
  close(signal?: string): Promise<void>
}

export interface HttpListenOptions {
  readonly port: number
  readonly hostname?: string
}

export interface HttpApplicationCapability {
  listen(options: HttpListenOptions): Promise<void>
  fetch(request: Request): Promise<Response>
}

export interface TriggerApplicationCapability {
  readonly triggers: {
    start(): Promise<void>
    stop(): Promise<void>
  }
}

export interface QueueConsumerHandle {
  stop(): Promise<void>
}

export interface QueueConsumerDriver {
  start(options: {
    consume(payload: unknown): Promise<void>
  }): Promise<QueueConsumerHandle>
}

export type HasCapability<
  TDefinition extends ApplicationDefinition,
  TCapability extends string,
> =
  Extract<
    ModuleCapabilities<TDefinition['modules'][number]>,
    TCapability
  > extends never
    ? false
    : true

export type HasHttp<TDefinition extends ApplicationDefinition> = HasCapability<
  TDefinition,
  'http'
>

export type HasTriggers<TDefinition extends ApplicationDefinition> =
  TDefinition['triggers'] extends readonly [] ? false : true

export type HostedApplication<TDefinition extends ApplicationDefinition> =
  BaseApplication<TDefinition> &
    (HasHttp<TDefinition> extends true ? HttpApplicationCapability : {}) &
    (HasTriggers<TDefinition> extends true ? TriggerApplicationCapability : {})

export type InvocationApplication<TDefinition extends ApplicationDefinition> =
  BaseApplication<TDefinition>

export { bindQueueDriver } from './queue.js'
