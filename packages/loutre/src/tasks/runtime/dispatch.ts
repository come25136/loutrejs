import {
  type ExecutionRuntimeBinding,
  type ExecutionKernelRuntime,
  type DependencyResolver,
} from '../../core/index.js'
import {
  type TasksCompiledExecution,
  type TasksCompiledTask,
} from '../compiled.js'
import { type TaskExecutionKey } from '../identity.js'
import { type ExecutionNodeId } from '../../core/model/identity.js'
import { match } from 'ts-pattern'
import { type TriggerHandle, startTrigger } from './triggers.js'
import { type TasksExtensionRuntime } from '../contract.js'

export function createTasksRuntime(
  bindings: readonly ExecutionRuntimeBinding<TasksCompiledExecution>[],
  applicationRuntime: ExecutionKernelRuntime,
): TasksExtensionRuntime {
  const runtimes = new Map<
    TaskExecutionKey,
    {
      readonly invoke: Function
      readonly executionId: ExecutionNodeId
    }
  >()
  const triggers: {
    readonly trigger: Exclude<TasksCompiledExecution, TasksCompiledTask>
    readonly resolve: DependencyResolver
  }[] = []
  for (const binding of bindings) {
    const { execution, resolve } = binding
    match(execution.compiled)
      .with({ kind: 'task' }, (compiled) => {
        runtimes.set(compiled.taskExecutionId, {
          invoke: compiled.handler.createResolver(binding)(),
          executionId: execution.id,
        })
      })
      .with(
        { kind: 'cron' },
        { kind: 'fixed-delay' },
        { kind: 'queue-consumer' },
        (trigger) => {
          triggers.push({ trigger, resolve })
        },
      )
      .exhaustive()
  }

  let triggerHandles: TriggerHandle[] = []
  let triggerStartup: Promise<void> | undefined
  let triggerStop: Promise<void> | undefined
  let triggersStarted = false
  let status: 'running' | 'draining' | 'stopped' = 'running'
  const activeInvocations = new Set<Promise<unknown>>()

  const invokeTask = (
    taskExecutionId: TaskExecutionKey,
    taskName: string,
    arguments_: readonly unknown[],
  ): Promise<unknown> => {
    if (status !== 'running') {
      return Promise.reject(new Error(`LUTRE_TASKS_${status.toUpperCase()}`))
    }
    const runtime = runtimes.get(taskExecutionId)
    if (!runtime) {
      return Promise.reject(new Error(`LUTRE_TASK_NOT_REGISTERED: ${taskName}`))
    }
    const invocation = (async () => {
      const executionId = runtime.executionId
      const hasInput = arguments_.length > 0
      const input = hasInput ? arguments_[0] : undefined
      const lease = applicationRuntime.beginExecution(
        {
          executionId,
          executionKind: 'task.invocation',
          graphNodeId: executionId,
          name: taskName,
        },
        {
          input,
          invoke: (nextInput) =>
            invokeTask(taskExecutionId, taskName, hasInput ? [nextInput] : []),
        },
      )
      let result: unknown
      let hasResult = false
      try {
        const invoke = () =>
          Reflect.apply(runtime.invoke, undefined, arguments_)
        result = await (lease.run ? lease.run(invoke) : invoke())
        hasResult = true
        return result
      } catch (error) {
        lease.fail?.(error)
        throw error
      } finally {
        if (hasResult) lease.complete(result)
        else lease.complete()
      }
    })()
    activeInvocations.add(invocation)
    void invocation.then(
      () => activeInvocations.delete(invocation),
      () => activeInvocations.delete(invocation),
    )
    return invocation
  }

  const run = (
    taskExecutionId: TaskExecutionKey,
    taskName: string,
    ...arguments_: any[]
  ): Promise<unknown> => invokeTask(taskExecutionId, taskName, arguments_)

  const stopTriggers = (): Promise<void> => {
    if (triggerStop) return triggerStop
    const stopping = (async () => {
      const startup = triggerStartup
      if (startup) await startup.catch(() => undefined)
      const handles = triggerHandles
      const stopOrder = handles.toReversed()
      const results = await Promise.allSettled(
        stopOrder.map((handle) => handle.stop()),
      )
      const failedHandles: TriggerHandle[] = []
      const errors: unknown[] = []
      for (const [index, result] of results.entries()) {
        if (result.status !== 'rejected') continue
        failedHandles.push(stopOrder[index]!)
        errors.push(result.reason)
      }
      triggerHandles = failedHandles.toReversed()
      triggersStarted = failedHandles.length > 0
      if (errors.length > 0) {
        throw new AggregateError(errors, 'Trigger stop failed')
      }
    })()
    let trackedStop!: Promise<void>
    trackedStop = stopping.finally(() => {
      if (triggerStop === trackedStop) triggerStop = undefined
    })
    triggerStop = trackedStop
    return trackedStop
  }

  const startTriggers = async (): Promise<void> => {
    if (status !== 'running') {
      throw new Error(`LUTRE_TASKS_${status.toUpperCase()}`)
    }
    if (triggersStarted) {
      throw new Error(
        'LUTRE_TRIGGERS_ALREADY_STARTED: Trigger Engine is already started.',
      )
    }

    const lease = applicationRuntime.beginExecution()
    triggersStarted = true
    const started: TriggerHandle[] = []
    const startup = (async () => {
      try {
        for (const { trigger, resolve } of triggers) {
          const handle = await startTrigger(trigger, run, resolve)
          started.push(handle)
          if (status !== 'running') {
            throw tasksStateError(status)
          }
        }
        triggerHandles = started
      } catch (error) {
        const stopOrder = started.toReversed()
        const cleanupResults = await Promise.allSettled(
          stopOrder.map((handle) => handle.stop()),
        )
        const failedHandles: TriggerHandle[] = []
        const cleanupErrors: unknown[] = []
        for (const [index, result] of cleanupResults.entries()) {
          if (result.status !== 'rejected') continue
          failedHandles.push(stopOrder[index]!)
          cleanupErrors.push(result.reason)
        }
        triggerHandles = failedHandles.toReversed()
        triggersStarted = failedHandles.length > 0
        if (cleanupErrors.length > 0) {
          throw new AggregateError(
            [error, ...cleanupErrors],
            'Trigger startup failed and cleanup also failed.',
            { cause: error },
          )
        }
        throw error
      }
    })()
    let trackedStartup!: Promise<void>
    trackedStartup = startup.finally(() => {
      lease.complete()
      if (triggerStartup === trackedStartup) triggerStartup = undefined
    })
    triggerStartup = trackedStartup
    await trackedStartup
  }

  return {
    run: run as TasksExtensionRuntime['run'],
    startTriggers,
    stopTriggers,
    async drain() {
      if (status === 'stopped') return
      status = 'draining'
      await stopTriggers()
      await Promise.allSettled(activeInvocations)
    },
    async close() {
      if (status === 'stopped') return
      try {
        await stopTriggers()
      } finally {
        status = 'stopped'
      }
    },
  }
}

function tasksStateError(status: string): Error {
  return new Error(`LUTRE_TASKS_${status.toUpperCase()}`)
}
