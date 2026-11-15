import {
  defineExecutionExtension,
  type Diagnostic,
  type ExecutionDefinition,
} from '../core/index.js'
import { match } from 'ts-pattern'
import { dependencyConsumerId } from '../core/identity.js'
import { taskName as compiledTaskName, triggerName } from './identity.js'
import {
  taskExecutionIdentityKey,
  taskExecutionIdentity,
  type TasksDefinitionData,
  type TasksHostApi,
  type TasksExtensionRuntime,
} from './contract.js'
import { milliseconds } from '../core/units.js'
import { queueRuntimeToken } from './queue.js'
import { isValidCronExpression } from './cron-schedule.js'
import { createTasksRuntime } from './runtime/dispatch.js'
import { type TasksCompiledExecution } from './compiled.js'

export const tasksExtension = defineExecutionExtension<
  ExecutionDefinition & { readonly declaration: TasksDefinitionData },
  TasksCompiledExecution,
  'tasks',
  TasksHostApi,
  TasksExtensionRuntime
>({
  kind: 'execution-extension',
  abiVersion: '2',
  name: 'loutre:tasks',
  compile(definition, context) {
    return match(definition.declaration)
      .with({ kind: 'task' }, (candidate) => {
        const handler = context.compileHandler(
          { kind: 'factory', factory: candidate.factory },
          {
            kind: 'execution',
            id: dependencyConsumerId(`task:${candidate.name}`),
            name: compiledTaskName(candidate.name),
          },
        )
        return {
          kind: 'execution' as const,
          id: `task.${candidate.name}`,
          executionKind: 'task.invocation',
          capabilities: [],
          compiled: Object.freeze({
            kind: 'task' as const,
            taskExecutionId: candidate[taskExecutionIdentityKey],
            name: compiledTaskName(candidate.name),
            handler,
          }),
        }
      })
      .with({ kind: 'cron' }, (candidate) => ({
        kind: 'execution' as const,
        id: `trigger.${candidate.name}`,
        executionKind: 'trigger.cron',
        capabilities: [],
        compiled: Object.freeze({
          kind: 'cron',
          name: triggerName(candidate.name),
          expression: candidate.expression,
          timezone: candidate.timezone,
          overlap: candidate.overlap,
          taskExecutionId: candidate.task.declaration[taskExecutionIdentityKey],
          taskName: compiledTaskName(candidate.task.declaration.name),
        }),
      }))
      .with({ kind: 'fixed-delay' }, (candidate) => ({
        kind: 'execution' as const,
        id: `trigger.${candidate.name}`,
        executionKind: 'trigger.fixed-delay',
        capabilities: [],
        compiled: Object.freeze({
          kind: 'fixed-delay',
          name: triggerName(candidate.name),
          delay: milliseconds(candidate.delay),
          immediate: candidate.immediate,
          taskExecutionId: candidate.task.declaration[taskExecutionIdentityKey],
          taskName: compiledTaskName(candidate.task.declaration.name),
        }),
      }))
      .with({ kind: 'queue-consumer' }, (candidate) => ({
        kind: 'execution' as const,
        id: `trigger.${candidate.name}`,
        executionKind: 'trigger.queue-consumer',
        dependencies: [queueRuntimeToken(candidate.queue)],
        capabilities: [],
        compiled: Object.freeze({
          kind: 'queue-consumer',
          name: triggerName(candidate.name),
          queueName: candidate.queue.name,
          queuePayload: candidate.queue.payload,
          queueDriver: queueRuntimeToken(candidate.queue),
          taskExecutionId: candidate.task.declaration[taskExecutionIdentityKey],
          taskName: compiledTaskName(candidate.task.declaration.name),
        }),
      }))
      .exhaustive()
  },
  references(definition) {
    return match(definition.declaration)
      .with({ kind: 'task' }, () => [])
      .with(
        { kind: 'cron' },
        { kind: 'fixed-delay' },
        { kind: 'queue-consumer' },
        (candidate) => [candidate.task],
      )
      .exhaustive()
  },
  validate({ executions }) {
    const taskExecutionIds = new Set(
      executions.flatMap(({ compiled }) =>
        match(compiled)
          .with({ kind: 'task' }, ({ taskExecutionId }) => [taskExecutionId])
          .with(
            { kind: 'cron' },
            { kind: 'fixed-delay' },
            { kind: 'queue-consumer' },
            () => [],
          )
          .exhaustive(),
      ),
    )
    const diagnostics: Diagnostic[] = []
    for (const execution of executions) {
      match(execution.compiled)
        .with({ kind: 'task' }, () => {})
        .with(
          { kind: 'cron' },
          { kind: 'fixed-delay' },
          { kind: 'queue-consumer' },
          (compiled) => {
            if (!taskExecutionIds.has(compiled.taskExecutionId)) {
              diagnostics.push({
                code: 'LUTRE_TRIGGER_TASK_MISSING',
                message: `Trigger ${compiled.name} references a Task that is unavailable in the compiled Tasks execution set.`,
                path: execution.id,
              })
            }
            match(compiled)
              .with({ kind: 'cron' }, (trigger) => {
                if (!isValidCronExpression(trigger.expression)) {
                  diagnostics.push({
                    code: 'LUTRE_TRIGGER_INVALID_CRON',
                    message: `Trigger ${trigger.name} must use a portable 5-field cron expression.`,
                    path: execution.id,
                  })
                }
                try {
                  new Intl.DateTimeFormat('en-US', {
                    timeZone: trigger.timezone,
                  }).format()
                } catch {
                  diagnostics.push({
                    code: 'LUTRE_TRIGGER_INVALID_TIMEZONE',
                    message: `Trigger ${trigger.name} must use a valid IANA timezone.`,
                    path: execution.id,
                  })
                }
              })
              .with(
                { kind: 'fixed-delay' },
                { kind: 'queue-consumer' },
                () => {},
              )
              .exhaustive()
          },
        )
        .exhaustive()
    }
    return diagnostics
  },
  createRuntime({ executions, applicationRuntime }) {
    return createTasksRuntime(executions, applicationRuntime)
  },
  projectGraph: ({ execution }) => {
    const compiled = execution.compiled
    return match(compiled)
      .with({ kind: 'task' }, (candidate) => ({
        kind: 'task',
        name: candidate.name,
      }))
      .with({ kind: 'cron' }, (candidate) => ({
        kind: 'cron',
        name: candidate.name,
        expression: candidate.expression,
        timezone: candidate.timezone,
        overlap: candidate.overlap,
        task: candidate.taskName,
      }))
      .with({ kind: 'fixed-delay' }, (candidate) => ({
        kind: 'fixed-delay',
        name: candidate.name,
        delay: milliseconds(candidate.delay),
        immediate: candidate.immediate,
        task: candidate.taskName,
      }))
      .with({ kind: 'queue-consumer' }, (candidate) => ({
        kind: 'queue-consumer',
        name: candidate.name,
        queue: candidate.queueName,
        task: candidate.taskName,
      }))
      .exhaustive()
  },
  host: {
    namespace: 'tasks',
    create: ({ runtime }) => ({
      run: (definition, ...arguments_) =>
        Reflect.apply(runtime.run, runtime, [
          taskExecutionIdentity(definition),
          definition.declaration.name,
          ...arguments_,
        ]),
      start: () => runtime.startTriggers(),
      stop: () => runtime.stopTriggers(),
    }),
  },
})
