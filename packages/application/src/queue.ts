import {
  provide,
  queueRuntimeToken,
  type ProviderDescriptor,
  type QueueDescriptor,
} from '@loutrejs/core'
import type { QueueConsumerDriver } from './index.js'

export function bindQueueDriver(
  queue: QueueDescriptor,
  driver: QueueConsumerDriver,
): ProviderDescriptor {
  return provide(queueRuntimeToken(queue)).useValue(driver)
}
