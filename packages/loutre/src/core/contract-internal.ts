import type { ContractDefinition } from './contract.js'

export const protocolNamespaceBuilder: unique symbol = Symbol(
  'loutre.protocol-namespace-builder',
)

export const protocolNamespaceType: unique symbol = Symbol(
  'loutre.protocol-namespace-type',
)

export const contractNodeBinding: unique symbol = Symbol(
  'loutre.contract-node-binding',
)

export const contractNodeMetadata: unique symbol = Symbol(
  'loutre.contract-node-metadata',
)

export interface ContractNodeMetadata {
  readonly root: ContractDefinition
  readonly path: readonly string[]
  readonly procedures: Readonly<Record<string, string>>
}

export function contractNodeMetadataOf(
  contract: ContractDefinition,
): ContractNodeMetadata | undefined {
  return contractNodeMetadata in contract
    ? (contract[contractNodeMetadata] as ContractNodeMetadata)
    : undefined
}

export function contractRootOf(
  contract: ContractDefinition,
): ContractDefinition {
  return contractNodeMetadata in contract
    ? (contract[contractNodeMetadata] as ContractNodeMetadata).root
    : contract
}

export function contractProcedurePathOf(
  contract: ContractDefinition,
  procedure: string,
): string {
  if (!(contractNodeMetadata in contract)) return procedure
  return (
    (contract[contractNodeMetadata] as ContractNodeMetadata).procedures[
      procedure
    ] ?? procedure
  )
}

export function contractNodePathOf(
  contract: ContractDefinition,
): readonly string[] | undefined {
  return contractNodeMetadata in contract
    ? (contract[contractNodeMetadata] as ContractNodeMetadata).path
    : undefined
}

export function contractOfBinding(value: unknown): ContractDefinition {
  if (
    typeof value === 'object' &&
    value !== null &&
    contractNodeBinding in value
  ) {
    return value[contractNodeBinding] as ContractDefinition
  }
  return value as ContractDefinition
}
