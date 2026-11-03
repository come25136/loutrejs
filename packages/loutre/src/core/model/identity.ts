type ModelId<Kind extends string> = string & {
  readonly '~loutre.model-node-id': Kind
}

export type ModuleId = ModelId<'module'>
export type ProviderNodeId = ModelId<'provider'>
export type ExecutionNodeId = ModelId<'execution'>
export type LifecycleNodeId = ModelId<'lifecycle'>
export type CapabilityNodeId = ModelId<'capability'>
export type ExtensionNodeId = ModelId<'extension'>
export type ModelNodeId =
  | ModuleId
  | ProviderNodeId
  | ExecutionNodeId
  | LifecycleNodeId
  | CapabilityNodeId
  | ExtensionNodeId

export const moduleId = (ordinal: number): ModuleId =>
  `module:${ordinal}` as ModuleId
export const providerNodeId = (ordinal: number): ProviderNodeId =>
  `provider:${ordinal}` as ProviderNodeId
export const executionNodeId = (value: string): ExecutionNodeId =>
  value as ExecutionNodeId
export const lifecycleNodeId = (
  owner: ModuleId,
  phase: string,
): LifecycleNodeId => `lifecycle:${owner}:${phase}` as LifecycleNodeId
export const capabilityNodeId = (value: string): CapabilityNodeId =>
  `capability:${value}` as CapabilityNodeId
export const extensionNodeId = (value: string): ExtensionNodeId =>
  `extension:${value}` as ExtensionNodeId

export const parseModelNodeId = (value: unknown): ModelNodeId | undefined =>
  typeof value === 'string' ? (value as ModelNodeId) : undefined
export const parseProviderNodeId = (
  value: unknown,
): ProviderNodeId | undefined =>
  typeof value === 'string' ? (value as ProviderNodeId) : undefined
