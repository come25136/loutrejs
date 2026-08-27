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
  TEntrypoint extends EntrypointDescriptor<any, any> | undefined,
  TTriggers extends readonly TriggerDescriptor[],
> {
  readonly modules: TModules
  readonly entrypoint?: TEntrypoint
  readonly triggers?: TTriggers
  readonly logger?: Logger
}

export interface ApplicationDefinition<
  TModules extends readonly ModuleInstance[] = readonly ModuleInstance[],
  TEntrypoint extends EntrypointDescriptor<any, any> | undefined =
    | EntrypointDescriptor<any, any>
    | undefined,
  TTriggers extends readonly TriggerDescriptor[] = readonly TriggerDescriptor[],
> {
  readonly kind: 'application-definition'
  readonly modules: TModules
  readonly entrypoint: TEntrypoint
  readonly triggers: TTriggers
  readonly logger?: Logger
}

export function defineApplication<
  const TModules extends readonly ModuleInstance[],
  const TEntrypoint extends EntrypointDescriptor<any, any> | undefined =
    undefined,
  const TTriggers extends readonly TriggerDescriptor[] = readonly [],
>(
  options: ApplicationDefinitionOptions<TModules, TEntrypoint, TTriggers>,
): ApplicationDefinition<TModules, TEntrypoint, TTriggers> {
  return Object.freeze({
    kind: 'application-definition',
    modules: options.modules,
    entrypoint: options.entrypoint as TEntrypoint,
    triggers: options.triggers ?? ([] as unknown as TTriggers),
    ...(options.logger === undefined ? {} : { logger: options.logger }),
  })
}

export interface BaseApplication {
  readonly graph: ApplicationGraphIR
  init(): Promise<this>
  close(signal?: string): Promise<void>
}

export interface EntrypointApplicationCapability<
  TEntrypoint extends EntrypointDescriptor<any, any>,
> {
  run(
    ...args: EntrypointArguments<TEntrypoint>
  ): Promise<EntrypointOutput<TEntrypoint>>
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

export type HasEntrypoint<TDefinition extends ApplicationDefinition> =
  TDefinition['entrypoint'] extends EntrypointDescriptor<any, any>
    ? true
    : false

export type HasTriggers<TDefinition extends ApplicationDefinition> =
  TDefinition['triggers'] extends readonly [] ? false : true

type EntrypointCapability<TDefinition extends ApplicationDefinition> =
  TDefinition['entrypoint'] extends EntrypointDescriptor<any, any>
    ? EntrypointApplicationCapability<TDefinition['entrypoint']>
    : {}

export type HostedApplication<TDefinition extends ApplicationDefinition> =
  BaseApplication &
    EntrypointCapability<TDefinition> &
    (HasHttp<TDefinition> extends true ? HttpApplicationCapability : {}) &
    (HasTriggers<TDefinition> extends true ? TriggerApplicationCapability : {})

export type InvocationApplication<TDefinition extends ApplicationDefinition> =
  BaseApplication & EntrypointCapability<TDefinition>

export { bindQueueDriver } from './queue.js'
