import {
  parseRunId,
  parseTraceId,
  parseSpanId,
  parseCapsuleId,
  parseInspectorRequestId,
  eventSequence,
} from '@loutrejs/loutre/devtools'
import {
  dependencyConsumerId,
  syntheticExecutionId,
  parseModelNodeId,
  parseProviderNodeId,
  epochMilliseconds,
  milliseconds,
  sourceFileReference,
  sourceLine,
  sourceColumn,
} from '@loutrejs/loutre'
import { executionNodeId } from '../../packages/loutre/src/core/model/identity.js'
import { normalizeHttpMethod, requestPathname } from '@loutrejs/loutre/http'
import { messagePortProcedureName } from '@loutrejs/loutre/message-port'

export const runId = (value: string) => parseRunId(value)!
export const traceId = (value: string) => parseTraceId(value)!
export const spanId = (value: string) => parseSpanId(value)!
export const capsuleId = (value: string) => parseCapsuleId(value)!
export const requestId = (value: string) => parseInspectorRequestId(value)!
export const modelNodeId = (value: string) => parseModelNodeId(value)!
export const providerNodeId = (value: string) => parseProviderNodeId(value)!
export {
  dependencyConsumerId,
  executionNodeId,
  syntheticExecutionId,
  eventSequence,
  epochMilliseconds,
  milliseconds,
  sourceFileReference,
  sourceLine,
  sourceColumn,
  normalizeHttpMethod,
  requestPathname,
  messagePortProcedureName,
}
