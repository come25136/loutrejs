export { bindQueueDriver, queue } from './queue.js'
import { consume, cron, fixedDelay } from './declaration.js'
export { task } from './declaration.js'
export const trigger = Object.freeze({ cron, fixedDelay, consume })
export { tasksExtension } from './extension.js'
export type {
  CronOverlap,
  CronTriggerDefinitionData,
  FixedDelayTriggerDefinitionData,
  QueueConsumerTriggerDefinitionData,
  TaskArguments,
  TaskDefinitionData,
  TaskExecutionIdentity,
  TaskInput,
  TaskOutput,
  TaskRuntime,
  TasksExtensionRuntime,
  TasksHostApi,
  TriggerDefinitionData,
} from './contract.js'
export type {
  CronTriggerDefinition,
  FixedDelayTriggerDefinition,
  QueueConsumerTriggerDefinition,
  TaskDefinition,
  TriggerDefinition,
} from './declaration.js'
export type {
  QueueConsumerDriver,
  QueueConsumerHandle,
  QueueDescriptor,
  QueuePayload,
} from './queue.js'
export type {
  TasksCompiledCronTrigger,
  TasksCompiledExecution,
  TasksCompiledFixedDelayTrigger,
  TasksCompiledQueueConsumerTrigger,
  TasksCompiledTask,
} from './compiled.js'

export type {
  TaskExecutionKey,
  TaskName,
  TriggerName,
  QueueName,
} from './identity.js'
