import { initializeWithEnvironment } from '@loutrejs/runtime'
import type { MessagePortApplication } from './index.js'

export function initializeMessagePortApplication(
  application: MessagePortApplication,
  environmentSource: unknown,
): Promise<void> {
  return initializeWithEnvironment(application, environmentSource)
}
