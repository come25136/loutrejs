import type {
  EntrypointArguments,
  EntrypointDescriptor,
  EntrypointOutput,
  ModuleInstance,
  ModuleProtocols,
  QueueConsumerDescriptor,
  QueueDescriptor,
  ScheduleDescriptor,
} from '@loutrejs/core'
import type { ApplicationGraphIR } from '@loutrejs/graph'
import type { Logger } from '@loutrejs/runtime'

export interface ApplicationDefinitionOptions<
  TModules extends readonly ModuleInstance[],
  TEntrypoints extends readonly EntrypointDescriptor<any, any>[],
  TSchedules extends readonly ScheduleDescriptor<any>[],
  TQueues extends readonly QueueDescriptor<any>[],
  TConsumers extends readonly QueueConsumerDescriptor<any, any>[],
> {
  readonly modules: TModules
  readonly entrypoints?: TEntrypoints
  readonly schedules?: TSchedules
  readonly queues?: TQueues
  readonly consumers?: TConsumers
  readonly logger?: Logger
}

export interface ApplicationDefinition<
  TModules extends readonly ModuleInstance[] = readonly ModuleInstance[],
  TEntrypoints extends readonly EntrypointDescriptor<any, any>[] =
    readonly EntrypointDescriptor<any, any>[],
  TSchedules extends readonly ScheduleDescriptor<any>[] =
    readonly ScheduleDescriptor<any>[],
  TQueues extends readonly QueueDescriptor<any>[] =
    readonly QueueDescriptor<any>[],
  TConsumers extends readonly QueueConsumerDescriptor<any, any>[] =
    readonly QueueConsumerDescriptor<any, any>[],
> {
  readonly kind: 'application-definition'
  readonly modules: TModules
  readonly entrypoints: TEntrypoints
  readonly schedules: TSchedules
  readonly queues: TQueues
  readonly consumers: TConsumers
  readonly logger?: Logger
}

export function defineApplication<
  const TModules extends readonly ModuleInstance[],
  const TEntrypoints extends readonly EntrypointDescriptor<any, any>[] =
    readonly [],
  const TSchedules extends readonly ScheduleDescriptor<any>[] = readonly [],
  const TQueues extends readonly QueueDescriptor<any>[] = readonly [],
  const TConsumers extends readonly QueueConsumerDescriptor<any, any>[] =
    readonly [],
>(
  options: ApplicationDefinitionOptions<
    TModules,
    TEntrypoints,
    TSchedules,
    TQueues,
    TConsumers
  >,
): ApplicationDefinition<
  TModules,
  TEntrypoints,
  TSchedules,
  TQueues,
  TConsumers
> {
  return Object.freeze({
    kind: 'application-definition',
    modules: options.modules,
    entrypoints: options.entrypoints ?? ([] as unknown as TEntrypoints),
    schedules: options.schedules ?? ([] as unknown as TSchedules),
    queues: options.queues ?? ([] as unknown as TQueues),
    consumers: options.consumers ?? ([] as unknown as TConsumers),
    ...(options.logger === undefined ? {} : { logger: options.logger }),
  })
}

type ExplicitEntrypoints<TDefinition extends ApplicationDefinition> =
  TDefinition['entrypoints'][number]

type ScheduledEntrypoints<TDefinition extends ApplicationDefinition> =
  TDefinition['schedules'][number] extends ScheduleDescriptor<infer TEntrypoint>
    ? TEntrypoint
    : never

type ConsumerEntrypoints<TDefinition extends ApplicationDefinition> =
  TDefinition['consumers'][number] extends QueueConsumerDescriptor<
    any,
    infer TEntrypoint
  >
    ? TEntrypoint
    : never

export type RegisteredEntrypoint<TDefinition extends ApplicationDefinition> =
  | ExplicitEntrypoints<TDefinition>
  | ScheduledEntrypoints<TDefinition>
  | ConsumerEntrypoints<TDefinition>

export interface BaseApplication<TDefinition extends ApplicationDefinition> {
  readonly graph: ApplicationGraphIR
  init(): Promise<this>
  run<TEntrypoint extends RegisteredEntrypoint<TDefinition>>(
    entrypoint: TEntrypoint,
    ...args: EntrypointArguments<TEntrypoint>
  ): Promise<EntrypointOutput<TEntrypoint>>
  close(): Promise<void>
}

export interface HttpListenOptions {
  readonly port: number
  readonly hostname?: string
}

export interface HttpApplicationCapability {
  listen(options: HttpListenOptions): Promise<void>
  fetch(request: Request): Promise<Response>
}

export interface SchedulerApplicationCapability {
  readonly scheduler: {
    start(): Promise<void>
    stop(): Promise<void>
  }
}

export interface QueueApplicationCapability {
  readonly queue: {
    listen(): Promise<void>
    stop(): Promise<void>
  }
}

export type HasHttp<TDefinition extends ApplicationDefinition> =
  Extract<ModuleProtocols<TDefinition['modules'][number]>, 'http'> extends never
    ? false
    : true

export type HasSchedules<TDefinition extends ApplicationDefinition> =
  TDefinition['schedules'] extends readonly [] ? false : true

export type HasConsumers<TDefinition extends ApplicationDefinition> =
  TDefinition['consumers'] extends readonly [] ? false : true

export type HostedApplication<TDefinition extends ApplicationDefinition> =
  BaseApplication<TDefinition> &
    (HasHttp<TDefinition> extends true ? HttpApplicationCapability : {}) &
    (HasSchedules<TDefinition> extends true
      ? SchedulerApplicationCapability
      : {}) &
    (HasConsumers<TDefinition> extends true ? QueueApplicationCapability : {})

export type InvocationApplication<TDefinition extends ApplicationDefinition> =
  BaseApplication<TDefinition>
