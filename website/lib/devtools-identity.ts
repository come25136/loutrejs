type Identity<T, Kind extends string> = T & { readonly '~loutre.website': Kind }
export type RunId = Identity<string, 'run'>
export type TraceId = Identity<string, 'trace'>
export type SpanId = Identity<string, 'span'>
export type CapsuleId = Identity<string, 'capsule'>
export type InspectorRequestId = Identity<string, 'inspector-request'>
export type ControlRequestId = Identity<string, 'control-request'>
export type EventSequence = Identity<number, 'event-sequence'>
export type EpochMs = Identity<number, 'epoch-ms'>
export type DurationMs = Identity<number, 'duration-ms'>
export type ModuleId = Identity<string, 'model-module'>
export type ProviderNodeId = Identity<string, 'model-provider'>
export type ExecutionNodeId = Identity<string, 'model-execution'>
export type CapabilityNodeId = Identity<string, 'model-capability'>
export type OtherModelNodeId = Identity<string, 'model-other'>
export type ModelNodeId =
  | ModuleId
  | ProviderNodeId
  | ExecutionNodeId
  | CapabilityNodeId
  | OtherModelNodeId
export type RuntimeExecutionId =
  | ExecutionNodeId
  | Identity<string, 'synthetic-execution'>
export type EntrypointNodeId = Identity<string, 'view-entrypoint'>
export type MiddlewareStepNodeId = Identity<string, 'view-middleware'>
export type HandlerNodeId = Identity<string, 'view-handler'>
export type GraphViewNodeId =
  | ModuleId
  | ProviderNodeId
  | ExecutionNodeId
  | CapabilityNodeId
  | EntrypointNodeId
  | MiddlewareStepNodeId
  | HandlerNodeId
export type ModuleGroupId = Identity<string, 'flow-module-group'>
export type FlowEdgeId = Identity<string, 'flow-edge'>
export type FlowHandleId = Identity<string, 'flow-handle'>
export type FlowNodeId = GraphViewNodeId | ModuleGroupId
export type DevtoolsBaseUrl = Identity<string, 'devtools-base-url'>
export type DevtoolsClientEndpoint = Identity<
  string,
  'devtools-client-endpoint'
>
export type RuntimeDeepLink = Identity<string, 'runtime-deep-link'>

export const runId = (value: string): RunId => value as RunId
export const capsuleId = (value: string): CapsuleId => value as CapsuleId
export const inspectorRequestId = (value: string): InspectorRequestId =>
  value as InspectorRequestId
export const eventSequence = (value: number): EventSequence =>
  value as EventSequence
export const epochMs = (value: number): EpochMs => value as EpochMs
export const runtimeExecutionId = (value: string): RuntimeExecutionId =>
  value as RuntimeExecutionId
export const modelNodeId = (value: string): ModelNodeId => value as ModelNodeId
export const providerNodeId = (value: string): ProviderNodeId =>
  value as ProviderNodeId
export const graphViewNodeId = (value: string): GraphViewNodeId =>
  value as GraphViewNodeId
export const flowNodeId = (value: string): FlowNodeId => value as FlowNodeId
export const parseModuleGroupId = (value: string): ModuleGroupId =>
  value as ModuleGroupId
export const moduleId = (value: string): ModuleId => value as ModuleId
export const executionNodeId = (value: string): ExecutionNodeId =>
  value as ExecutionNodeId
export const capabilityNodeId = (value: string): CapabilityNodeId =>
  value as CapabilityNodeId
export const entrypointNodeId = (value: string): EntrypointNodeId =>
  value as EntrypointNodeId
export const middlewareStepNodeId = (value: string): MiddlewareStepNodeId =>
  value as MiddlewareStepNodeId
export const handlerNodeId = (value: string): HandlerNodeId =>
  value as HandlerNodeId

export const parseTraceId = (value: string): TraceId => value as TraceId
export const parseSpanId = (value: string): SpanId => value as SpanId
export const controlRequestId = (value: string): ControlRequestId =>
  value as ControlRequestId
export const durationMs = (value: number): DurationMs => value as DurationMs
export const moduleGroupId = (value: ModuleId): ModuleGroupId =>
  `module-group:${encodeURIComponent(value)}` as ModuleGroupId
export const flowEdgeId = (value: string): FlowEdgeId => value as FlowEdgeId
export const flowHandleId = (value: string): FlowHandleId =>
  value as FlowHandleId
export function normalizeDevtoolsBaseUrl(value: string): DevtoolsBaseUrl {
  const url = new URL(value)
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1')
    throw new Error('Invalid local DevTools URL.')
  return url.origin as DevtoolsBaseUrl
}
export function devtoolsClientEndpoint(
  value: DevtoolsBaseUrl,
): DevtoolsClientEndpoint {
  const url = new URL(value)
  url.protocol = 'ws:'
  url.pathname = '/__loutre/client'
  url.search = ''
  url.hash = ''
  return url.toString() as DevtoolsClientEndpoint
}
export function runtimeDeepLink(
  trace: TraceId,
  span?: SpanId,
): RuntimeDeepLink {
  const params = new URLSearchParams()
  params.set('trace', trace)
  if (span) params.set('span', span)
  return `?${params.toString()}` as RuntimeDeepLink
}
