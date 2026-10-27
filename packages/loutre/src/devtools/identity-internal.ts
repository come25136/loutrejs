import type {
  RunId,
  TraceId,
  SpanId,
  CapsuleId,
  CaptureHandleId,
} from './identity.js'

export const createRunId = (): RunId => `run_${crypto.randomUUID()}` as RunId
export const createTraceId = (): TraceId =>
  `trace_${crypto.randomUUID()}` as TraceId
export const createSpanId = (): SpanId =>
  `span_${crypto.randomUUID()}` as SpanId
export const createCapsuleId = (): CapsuleId =>
  `capsule_${crypto.randomUUID()}` as CapsuleId
export const createCaptureHandleId = (): CaptureHandleId =>
  `ref_${crypto.randomUUID()}` as CaptureHandleId
