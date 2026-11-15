import {
  type TaskInput,
  type TaskDefinitionData,
  type TaskExecutionIdentity,
  type AnyTaskDefinition,
  type CronTriggerDefinitionData,
  type FixedDelayTriggerDefinitionData,
  type QueueConsumerTriggerDefinitionData,
  type TaskRuntime,
  taskExecutionIdentityKey,
  type CronOverlap,
} from './contract.js'
import { type ExecutionDefinition, defineExecution } from '../core/index.js'
import { tasksExtension } from './extension.js'
import { type QueueDescriptor, type QueuePayload } from './queue.js'
import { taskExecutionKey } from './identity.js'

type VoidTaskConstraint<TTask> = [TaskInput<TTask>] extends [void]
  ? unknown
  : never

export type TaskDefinition<
  TInput = unknown,
  TOutput = unknown,
> = ExecutionDefinition<typeof tasksExtension> & {
  readonly declaration: TaskDefinitionData<TInput, TOutput> &
    TaskExecutionIdentity
}

export type CronTriggerDefinition<
  TTask extends AnyTaskDefinition = TaskDefinition<void, any>,
> = ExecutionDefinition<typeof tasksExtension> & {
  readonly declaration: CronTriggerDefinitionData<TTask>
}

export type FixedDelayTriggerDefinition<
  TTask extends AnyTaskDefinition = TaskDefinition<void, any>,
> = ExecutionDefinition<typeof tasksExtension> & {
  readonly declaration: FixedDelayTriggerDefinitionData<TTask>
}

export type QueueConsumerTriggerDefinition<
  TQueue extends QueueDescriptor<any> = QueueDescriptor<any>,
  TTask extends AnyTaskDefinition = TaskDefinition<any, any>,
> = ExecutionDefinition<typeof tasksExtension> & {
  readonly declaration: QueueConsumerTriggerDefinitionData<TQueue, TTask>
}

export type TriggerDefinition =
  | CronTriggerDefinition
  | FixedDelayTriggerDefinition
  | QueueConsumerTriggerDefinition

export function task<TInput = void, TOutput = void>(definition: {
  readonly name: string
  readonly factory: () => TaskRuntime<TInput, TOutput>
}): TaskDefinition<TInput, TOutput> {
  const taskExecutionId = taskExecutionKey(
    Symbol(`loutre.tasks.execution:${definition.name}`),
  )
  return defineExecution(tasksExtension, {
    declaration: {
      kind: 'task' as const,
      name: definition.name,
      factory: definition.factory,
      [taskExecutionIdentityKey]: taskExecutionId,
    },
  })
}

export function cron<const TTask extends AnyTaskDefinition>(
  declaration: {
    readonly name: string
    readonly expression: string
    readonly timezone: string
    readonly overlap?: CronOverlap
    readonly task: TTask
  } & VoidTaskConstraint<TTask>,
): CronTriggerDefinition<TTask> {
  return defineExecution(tasksExtension, {
    declaration: {
      kind: 'cron' as const,
      name: declaration.name,
      expression: declaration.expression,
      timezone: declaration.timezone,
      overlap: declaration.overlap ?? 'skip',
      task: declaration.task,
    },
  })
}

export function fixedDelay<const TTask extends AnyTaskDefinition>(
  declaration: {
    readonly name: string
    readonly delay: number
    readonly immediate?: boolean
    readonly task: TTask
  } & VoidTaskConstraint<TTask>,
): FixedDelayTriggerDefinition<TTask> {
  if (
    !Number.isFinite(declaration.delay) ||
    !Number.isInteger(declaration.delay) ||
    declaration.delay < 0
  ) {
    throw new Error(
      'LUTRE_TRIGGER_INVALID_FIXED_DELAY: fixedDelay.delay must be a non-negative finite integer.',
    )
  }
  return defineExecution(tasksExtension, {
    declaration: {
      kind: 'fixed-delay' as const,
      name: declaration.name,
      delay: declaration.delay,
      immediate: declaration.immediate ?? false,
      task: declaration.task,
    },
  })
}

type ConsumerTaskConstraint<TQueue, TTask> = [TaskInput<TTask>] extends [
  QueuePayload<TQueue>,
]
  ? [QueuePayload<TQueue>] extends [TaskInput<TTask>]
    ? unknown
    : never
  : never

export function consume<
  const TQueue extends QueueDescriptor<any>,
  const TTask extends AnyTaskDefinition,
>(
  declaration: {
    readonly name: string
    readonly queue: TQueue
    readonly task: TTask
  } & ConsumerTaskConstraint<TQueue, TTask>,
): QueueConsumerTriggerDefinition<TQueue, TTask> {
  return defineExecution(tasksExtension, {
    declaration: {
      kind: 'queue-consumer',
      name: declaration.name,
      queue: declaration.queue,
      task: declaration.task,
    },
  })
}
