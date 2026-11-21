import {
  type TasksCompiledExecution,
  type TasksCompiledTask,
  type TasksCompiledCronTrigger,
  type TasksCompiledFixedDelayTrigger,
  type TasksCompiledQueueConsumerTrigger,
} from '../compiled.js'
import { type TaskExecutionKey } from '../identity.js'
import { type DependencyResolver, validateSchema } from '../../core/index.js'
import { match } from 'ts-pattern'
import { parseCronSchedule, matchesCronTrigger } from '../cron-schedule.js'
import { type QueueConsumerHandle } from '../queue.js'

export type TriggerHandle = { stop(): Promise<void> }

export async function startTrigger(
  trigger: Exclude<TasksCompiledExecution, TasksCompiledTask>,
  run: (
    taskExecutionId: TaskExecutionKey,
    taskName: string,
    ...arguments_: any[]
  ) => Promise<unknown>,
  resolve: DependencyResolver,
): Promise<TriggerHandle> {
  return match(trigger)
    .with({ kind: 'cron' }, (candidate) => startCronTrigger(candidate, run))
    .with({ kind: 'fixed-delay' }, (candidate) =>
      startFixedDelayTrigger(candidate, run),
    )
    .with({ kind: 'queue-consumer' }, (candidate) =>
      startQueueTrigger(candidate, run, resolve),
    )
    .exhaustive()
}

function startCronTrigger(
  trigger: TasksCompiledCronTrigger,
  run: (
    taskExecutionId: TaskExecutionKey,
    taskName: string,
    ...arguments_: any[]
  ) => Promise<unknown>,
): TriggerHandle {
  let stopped = false
  const schedule = parseCronSchedule(trigger.expression, trigger.timezone)
  let lastMinute: number | undefined
  const active = new Set<Promise<unknown>>()
  const tick = () => {
    if (stopped) return
    const now = new Date()
    if (!matchesCronTrigger(schedule, now)) return
    const minute = Math.floor(now.getTime() / 60_000)
    if (lastMinute === minute) return
    lastMinute = minute
    if (trigger.overlap === 'skip' && active.size > 0) return
    const execution = run(trigger.taskExecutionId, trigger.taskName).catch(
      () => undefined,
    )
    active.add(execution)
    void execution.finally(() => active.delete(execution))
  }
  tick()
  const timer = setInterval(tick, 1_000)
  return {
    async stop() {
      if (stopped) return
      stopped = true
      clearInterval(timer)
      await Promise.allSettled(active)
    },
  }
}

function startFixedDelayTrigger(
  trigger: TasksCompiledFixedDelayTrigger,
  run: (
    taskExecutionId: TaskExecutionKey,
    taskName: string,
    ...arguments_: any[]
  ) => Promise<unknown>,
): TriggerHandle {
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let releaseSleep: (() => void) | undefined
  const sleep = async () => {
    let remaining: number = trigger.delay
    do {
      // 32bit符号付き整数の上限を超すタイマーはNode.jsで1msに短縮される。
      const interval = Math.min(remaining, 2 ** 31 - 1)
      await new Promise<void>((resolve) => {
        releaseSleep = resolve
        timer = setTimeout(resolve, interval)
      })
      timer = undefined
      releaseSleep = undefined
      if (stopped) return
      remaining -= interval
    } while (remaining > 0)
  }
  const execute = async () => {
    await run(trigger.taskExecutionId, trigger.taskName).catch(() => undefined)
  }
  const loop = (async () => {
    if (!trigger.immediate) await sleep()
    while (true) {
      if (stopped) break
      await execute()
      if (stopped) break
      await sleep()
    }
  })()
  return {
    async stop() {
      if (stopped) return
      stopped = true
      if (timer !== undefined) clearTimeout(timer)
      timer = undefined
      releaseSleep?.()
      releaseSleep = undefined
      await loop
    },
  }
}

async function startQueueTrigger(
  trigger: TasksCompiledQueueConsumerTrigger,
  run: (
    taskExecutionId: TaskExecutionKey,
    taskName: string,
    ...arguments_: any[]
  ) => Promise<unknown>,
  resolve: DependencyResolver,
): Promise<QueueConsumerHandle> {
  const driver = resolve(trigger.queueDriver)
  if (!driver || typeof driver.start !== 'function') {
    throw new Error(
      `LUTRE_QUEUE_DRIVER_INVALID: Queue ${trigger.queueName} driver is invalid.`,
    )
  }
  const handle = await driver.start({
    consume: async (payload) => {
      const validated = await validateSchema(trigger.queuePayload, payload)
      await run(trigger.taskExecutionId, trigger.taskName, validated)
    },
  })
  if (!handle || typeof handle.stop !== 'function') {
    throw new Error(
      `LUTRE_QUEUE_DRIVER_INVALID: Queue ${trigger.queueName} driver returned an invalid handle.`,
    )
  }
  return handle
}
