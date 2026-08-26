import { initializeWithEnvironment } from '@loutrejs/runtime'
import type { MessagePortProtocolExecution } from './index.js'

export function initializeMessagePortExecution(
  application: MessagePortProtocolExecution,
  environmentSource: unknown,
): Promise<void> {
  return initializeWithEnvironment(application, environmentSource)
}
