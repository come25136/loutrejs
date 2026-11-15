import {
  type TaskExecutionKey,
  type TaskName,
  type TriggerName,
  type QueueName,
} from './identity.js'
import {
  type ExecutionHandlerResolver,
  type StandardSchemaV1,
  type Token,
} from '../core/index.js'
import { type CronOverlap } from './contract.js'
import { type DurationMs } from '../core/units.js'
import { type QueueConsumerDriver } from './queue.js'

export interface TasksCompiledTask {
  readonly kind: 'task'
  readonly taskExecutionId: TaskExecutionKey
  readonly name: TaskName
  readonly handler: ExecutionHandlerResolver<Function>
}

export interface TasksCompiledCronTrigger {
  readonly kind: 'cron'
  readonly name: TriggerName
  readonly expression: string
  readonly timezone: string
  readonly overlap: CronOverlap
  readonly taskExecutionId: TaskExecutionKey
  readonly taskName: TaskName
}

export interface TasksCompiledFixedDelayTrigger {
  readonly kind: 'fixed-delay'
  readonly name: TriggerName
  readonly delay: DurationMs
  readonly immediate: boolean
  readonly taskExecutionId: TaskExecutionKey
  readonly taskName: TaskName
}

export interface TasksCompiledQueueConsumerTrigger {
  readonly kind: 'queue-consumer'
  readonly name: TriggerName
  readonly queueName: QueueName
  readonly queuePayload: StandardSchemaV1
  readonly queueDriver: Token<QueueConsumerDriver>
  readonly taskExecutionId: TaskExecutionKey
  readonly taskName: TaskName
}

export type TasksCompiledExecution =
  | TasksCompiledTask
  | TasksCompiledCronTrigger
  | TasksCompiledFixedDelayTrigger
  | TasksCompiledQueueConsumerTrigger
