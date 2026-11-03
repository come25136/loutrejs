type DevtoolsId<Kind extends string> = string & {
  readonly '~loutre.devtools-id': Kind
}
export type RunId = DevtoolsId<'run'>
export type TraceId = DevtoolsId<'trace'>
export type SpanId = DevtoolsId<'span'>
export type CapsuleId = DevtoolsId<'capsule'>
export type InspectorRequestId = DevtoolsId<'inspector-request'>
export type ControlRequestId = DevtoolsId<'control-request'>
export type CaptureHandleId = DevtoolsId<'capture-handle'>
export type EventSequence = number & {
  readonly '~loutre.devtools-sequence': true
}

export const parseRunId = (value: unknown): RunId | undefined =>
  typeof value === 'string' ? (value as RunId) : undefined
export const parseTraceId = (value: unknown): TraceId | undefined =>
  typeof value === 'string' ? (value as TraceId) : undefined
export const parseSpanId = (value: unknown): SpanId | undefined =>
  typeof value === 'string' ? (value as SpanId) : undefined
export const parseCapsuleId = (value: unknown): CapsuleId | undefined =>
  typeof value === 'string' ? (value as CapsuleId) : undefined
export const parseInspectorRequestId = (
  value: unknown,
): InspectorRequestId | undefined =>
  typeof value === 'string' ? (value as InspectorRequestId) : undefined
export const parseControlRequestId = (
  value: unknown,
): ControlRequestId | undefined =>
  typeof value === 'string' ? (value as ControlRequestId) : undefined
export const eventSequence = (value: number): EventSequence =>
  value as EventSequence
