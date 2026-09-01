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

export const contractNodeKindType: unique symbol = Symbol(
  'loutre.contract-node-kind-type',
)

export const contractNodeMetadata: unique symbol = Symbol(
  'loutre.contract-node-metadata',
)

export interface ContractNodeMetadata {
  readonly kind: 'leaf' | 'branch'
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

export interface ContractProcedureIdentity {
  readonly contract: ContractDefinition
  readonly procedure: string
}

export function resolveContractProcedureIdentity(
  contract: ContractDefinition,
  procedure: string,
  applicationContract?: ContractDefinition,
): ContractProcedureIdentity {
  if (applicationContract && contract === applicationContract) {
    return { contract: applicationContract, procedure }
  }

  const canonicalProcedure = contractProcedurePathOf(contract, procedure)
  if (applicationContract) {
    const applicationNode = contractNodeMetadataOf(applicationContract)
    const implementationNode = contractNodeMetadataOf(contract)
    if (
      applicationNode &&
      implementationNode &&
      applicationNode.root === implementationNode.root &&
      isContractNodePathPrefix(applicationNode.path, implementationNode.path)
    ) {
      const prefix = applicationNode.path.slice(1).join('.')
      const relativeProcedure = canonicalProcedure.startsWith(`${prefix}.`)
        ? canonicalProcedure.slice(prefix.length + 1)
        : canonicalProcedure
      return { contract: applicationContract, procedure: relativeProcedure }
    }
  }

  return {
    contract: contractRootOf(contract),
    procedure: canonicalProcedure,
  }
}

function isContractNodePathPrefix(
  prefix: readonly string[],
  candidate: readonly string[],
): boolean {
  return (
    prefix.length <= candidate.length &&
    prefix.every((segment, index) => candidate[index] === segment)
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
