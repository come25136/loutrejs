import { binding, type QueueConsumerDriver } from '@loutrejs/application'
import type { ProviderDescriptor, QueueDescriptor } from '@loutrejs/core'

export interface BullMqQueueDriverOptions {
  readonly connection: unknown
  readonly concurrency?: number
  readonly prefix?: string
  readonly workerOptions?: Readonly<Record<string, unknown>>
}

interface BullMqWorkerLike {
  waitUntilReady(): Promise<unknown>
  close(force?: boolean): Promise<void>
}

interface BullMqModuleLike {
  readonly Worker: new (
    name: string,
    processor: (job: { readonly data: unknown }) => Promise<void>,
    options: Readonly<Record<string, unknown>>,
  ) => BullMqWorkerLike
}

export function createBullMqQueueDriver(
  queue: QueueDescriptor,
  options: BullMqQueueDriverOptions,
): QueueConsumerDriver {
  if (
    options.concurrency !== undefined &&
    (!Number.isInteger(options.concurrency) || options.concurrency <= 0)
  ) {
    throw new Error(
      'LUTRE_BULLMQ_CONCURRENCY: concurrency must be a positive integer.',
    )
  }

  return {
    async start({ consume }) {
      const { Worker } = await loadBullMq()
      const worker = new Worker(
        queue.name,
        async (job) => {
          await consume(job.data)
        },
        {
          ...options.workerOptions,
          connection: options.connection,
          ...(options.concurrency === undefined
            ? {}
            : { concurrency: options.concurrency }),
          ...(options.prefix === undefined ? {} : { prefix: options.prefix }),
        },
      )
      try {
        await worker.waitUntilReady()
      } catch (error) {
        await worker.close(true).catch(() => undefined)
        throw error
      }
      return {
        stop: () => worker.close(),
      }
    },
  }
}

export function bindBullMqQueue(
  queue: QueueDescriptor,
  options: BullMqQueueDriverOptions,
): ProviderDescriptor {
  return binding.queue(queue, createBullMqQueueDriver(queue, options))
}

async function loadBullMq(): Promise<BullMqModuleLike> {
  const specifier = 'bullmq'
  try {
    return (await import(specifier)) as BullMqModuleLike
  } catch (error) {
    throw new Error(
      'LUTRE_BULLMQ_MISSING: @loutrejs/queue-bullmq requires the optional peer dependency bullmq.',
      { cause: error },
    )
  }
}
