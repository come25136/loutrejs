import type { Brand } from '../internal/brand.js'
export type TaskExecutionKey = Brand<symbol, 'tasks.execution-key'>
export type TaskName = Brand<string, 'tasks.task-name'>
export type TriggerName = Brand<string, 'tasks.trigger-name'>
export type QueueName<TName extends string = string> = Brand<
  TName,
  'tasks.queue-name'
>
export const taskExecutionKey = (value: symbol): TaskExecutionKey =>
  value as TaskExecutionKey
export const taskName = (value: string): TaskName => value as TaskName
export const triggerName = (value: string): TriggerName => value as TriggerName
export const queueName = <const TName extends string>(
  value: TName,
): QueueName<TName> => value as QueueName<TName>
