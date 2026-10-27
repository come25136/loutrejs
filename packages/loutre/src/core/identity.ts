import type { Brand } from '../internal/brand.js'
import type { ExecutionNodeId, ModelNodeId } from './model/identity.js'

export type CapabilityId = Brand<string, 'core.capability-id'>
export type CapabilityIdentity = Brand<symbol, 'core.capability-identity'>
export type ExtensionName = Brand<string, 'core.extension-name'>
export type ExtensionAbiVersion = Brand<string, 'core.extension-abi'>
export type ExtensionIdentity = Brand<symbol, 'core.extension-identity'>
export type TokenKey = Brand<symbol, 'core.token-key'>
export type SyntheticExecutionId = Brand<string, 'core.synthetic-execution-id'>
export type RuntimeExecutionId = ExecutionNodeId | SyntheticExecutionId
export type DependencyConsumerId =
  | ModelNodeId
  | Brand<string, 'core.dependency-consumer-id'>
export type ModuleName = Brand<string, 'core.module-name'>
export type HostNamespace = Brand<string, 'core.host-namespace'>

export const runtimeExecutionId = (value: string): RuntimeExecutionId =>
  value as RuntimeExecutionId
export const syntheticExecutionId = (value: string): SyntheticExecutionId =>
  value as SyntheticExecutionId
export const dependencyConsumerId = (value: string): DependencyConsumerId =>
  value as DependencyConsumerId
export const moduleName = (value: string): ModuleName => value as ModuleName
export const hostNamespace = (value: string): HostNamespace =>
  value as HostNamespace
