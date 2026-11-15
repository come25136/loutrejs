import { type TaskExecutionKey, taskExecutionKey } from './identity.js'
import { type ExecutionDefinition } from '../core/index.js'
import { type QueueDescriptor } from './queue.js'

export type TaskRuntime<TInput, TOutput> = [TInput] extends [void]
  ? () => TOutput | Promise<TOutput>
  : (input: TInput) => TOutput | Promise<TOutput>

export interface TaskDefinitionData<TInput = unknown, TOutput = unknown> {
  readonly kind: 'task'
  readonly name: string
  readonly factory: () => TaskRuntime<TInput, TOutput>
  readonly '~input'?: TInput
  readonly '~output'?: TOutput
}

export type TaskInput<TTask> = TTask extends {
  readonly declaration: TaskDefinitionData<infer TInput, any>
}
  ? TInput
  : never

export type TaskOutput<TTask> = TTask extends {
  readonly declaration: TaskDefinitionData<any, infer TOutput>
}
  ? TOutput
  : never

export type TaskArguments<TTask> = [TaskInput<TTask>] extends [void]
  ? readonly []
  : readonly [input: TaskInput<TTask>]

export const taskExecutionIdentityKey: unique symbol = Symbol.for(
  'loutre.tasks.task-execution-identity',
) as typeof taskExecutionIdentityKey

export interface TaskExecutionIdentity {
  readonly [taskExecutionIdentityKey]: TaskExecutionKey
}

export type AnyTaskDefinition = ExecutionDefinition & {
  readonly declaration: TaskExecutionIdentity & {
    readonly kind: 'task'
    readonly name: string
    readonly factory: () => Function
  }
}

export type CronOverlap = 'allow' | 'skip'

export interface CronTriggerDefinitionData<
  TTask extends AnyTaskDefinition = AnyTaskDefinition,
> {
  readonly kind: 'cron'
  readonly name: string
  readonly expression: string
  readonly timezone: string
  readonly overlap: CronOverlap
  readonly task: TTask
}

export interface FixedDelayTriggerDefinitionData<
  TTask extends AnyTaskDefinition = AnyTaskDefinition,
> {
  readonly kind: 'fixed-delay'
  readonly name: string
  readonly delay: number
  readonly immediate: boolean
  readonly task: TTask
}

export interface QueueConsumerTriggerDefinitionData<
  TQueue extends QueueDescriptor<any> = QueueDescriptor<any>,
  TTask extends AnyTaskDefinition = AnyTaskDefinition,
> {
  readonly kind: 'queue-consumer'
  readonly name: string
  readonly queue: TQueue
  readonly task: TTask
}

export type TriggerDefinitionData =
  | CronTriggerDefinitionData
  | FixedDelayTriggerDefinitionData
  | QueueConsumerTriggerDefinitionData

export type TasksDefinitionData =
  | (TaskDefinitionData & TaskExecutionIdentity)
  | TriggerDefinitionData

export interface TasksExtensionRuntime {
  run<TInput, TOutput>(
    taskExecutionId: TaskExecutionKey,
    taskName: string,
    ...arguments_: [TInput] extends [void]
      ? readonly []
      : readonly [input: TInput]
  ): Promise<TOutput>
  startTriggers(): Promise<void>
  stopTriggers(): Promise<void>
  drain(): Promise<void>
  close(): Promise<void>
}

export interface TasksHostApi {
  run<TInput, TOutput>(
    task: ExecutionDefinition & {
      readonly declaration: TaskDefinitionData<TInput, TOutput> &
        TaskExecutionIdentity
    },
    ...arguments_: [TInput] extends [void]
      ? readonly []
      : readonly [input: TInput]
  ): Promise<TOutput>
  start(): Promise<void>
  stop(): Promise<void>
}

export function taskExecutionIdentity({
  declaration: definition,
}: AnyTaskDefinition): TaskExecutionKey {
  if (
    taskExecutionIdentityKey in definition &&
    typeof definition[taskExecutionIdentityKey] === 'symbol'
  ) {
    return taskExecutionKey(definition[taskExecutionIdentityKey])
  }
  return taskExecutionKey(Symbol('loutre.tasks.unregistered'))
}
