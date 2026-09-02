/// <reference lib="esnext.disposable" preserve="true" />

import type {
  ArgsClass,
  ModuleProtocols,
  ModuleInstance,
  SchemaInput,
  TaskArguments,
  TaskDescriptor,
  TaskOutput,
  TokenLike,
  TokenValue,
  TriggerDescriptor,
} from '../core/index.js'
import type { ApplicationGraphIR } from '../graph/index.js'
import type { Logger } from '../runtime/index.js'

export interface ApplicationDefinitionOptions<
  TModules extends readonly ModuleInstance[],
  TArguments extends ArgsClass | undefined,
  TTasks extends readonly TaskDescriptor<any, any>[],
  TTriggers extends readonly TriggerDescriptor[],
> {
  readonly modules: TModules
  readonly arguments?: TArguments
  readonly tasks?: TTasks
  readonly triggers?: TTriggers
  readonly logger?: Logger
}

export interface ApplicationDefinition<
  TModules extends readonly ModuleInstance[] = readonly ModuleInstance[],
  TArguments extends ArgsClass | undefined = ArgsClass | undefined,
  TTasks extends readonly TaskDescriptor<any, any>[] = readonly TaskDescriptor<
    any,
    any
  >[],
  TTriggers extends readonly TriggerDescriptor[] = readonly TriggerDescriptor[],
> {
  readonly kind: 'application-definition'
  readonly modules: TModules
  readonly arguments: TArguments
  readonly tasks: TTasks
  readonly triggers: TTriggers
  readonly logger?: Logger
}

export function defineApplication<
  const TModules extends readonly ModuleInstance[],
  const TArguments extends ArgsClass | undefined = undefined,
  const TTasks extends readonly TaskDescriptor<any, any>[] = readonly [],
  const TTriggers extends readonly TriggerDescriptor[] = readonly [],
>(
  options: ApplicationDefinitionOptions<
    TModules,
    TArguments,
    TTasks,
    TTriggers
  >,
): ApplicationDefinition<TModules, TArguments, TTasks, TTriggers> {
  return Object.freeze({
    kind: 'application-definition',
    modules: options.modules,
    arguments: options.arguments as TArguments,
    tasks: options.tasks ?? ([] as unknown as TTasks),
    triggers: options.triggers ?? ([] as unknown as TTriggers),
    ...(options.logger === undefined ? {} : { logger: options.logger }),
  })
}

export type ApplicationArgumentsInput<
  TDefinition extends ApplicationDefinition,
> =
  TDefinition['arguments'] extends ArgsClass<infer TSchema>
    ? SchemaInput<TSchema>
    : never

export type BootstrapArguments<TDefinition extends ApplicationDefinition> =
  TDefinition['arguments'] extends ArgsClass<infer TSchema>
    ? {} extends SchemaInput<TSchema>
      ? { readonly arguments?: SchemaInput<TSchema> }
      : { readonly arguments: SchemaInput<TSchema> }
    : { readonly arguments?: never }

export interface BaseApplication extends AsyncDisposable {
  readonly graph: ApplicationGraphIR
  get<TToken extends TokenLike>(token: TToken): TokenValue<TToken>
  init(): Promise<this>
  close(signal?: string): Promise<void>
}

export interface TaskApplicationCapability<
  TTasks extends readonly TaskDescriptor<any, any>[],
> {
  run<TTask extends TTasks[number]>(
    task: TTask,
    ...args: TaskArguments<TTask>
  ): Promise<TaskOutput<TTask>>
}

export interface HttpApplicationCapability {
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

export type HasProtocol<
  TDefinition extends ApplicationDefinition,
  TProtocol extends string,
> =
  Extract<
    ModuleProtocols<TDefinition['modules'][number]>,
    TProtocol
  > extends never
    ? false
    : true

export type HasHttp<TDefinition extends ApplicationDefinition> = HasProtocol<
  TDefinition,
  'http'
>

export type HasMessagePort<TDefinition extends ApplicationDefinition> =
  HasProtocol<TDefinition, 'messagePort'>

export type HasTasks<TDefinition extends ApplicationDefinition> =
  TDefinition['tasks'] extends readonly [] ? false : true

export type HasTriggers<TDefinition extends ApplicationDefinition> =
  TDefinition['triggers'] extends readonly [] ? false : true

type TaskCapability<TDefinition extends ApplicationDefinition> =
  TDefinition['tasks'] extends readonly []
    ? {}
    : TaskApplicationCapability<TDefinition['tasks']>

export type HostedApplication<TDefinition extends ApplicationDefinition> =
  BaseApplication &
    TaskCapability<TDefinition> &
    (HasHttp<TDefinition> extends true ? HttpApplicationCapability : {}) &
    (HasTriggers<TDefinition> extends true ? TriggerApplicationCapability : {})

export type InvocationApplication<TDefinition extends ApplicationDefinition> =
  BaseApplication & TaskCapability<TDefinition>

export { binding } from './binding.js'
export type {
  HostBinding,
  HostBindingApplication,
  InvocationBinding,
  InvocationBindingBaseOptions,
  InvocationBindingOptions,
} from './binding.js'
