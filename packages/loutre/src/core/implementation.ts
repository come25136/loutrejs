import {
  contractNodeMetadataOf,
  contractOfBinding,
} from './contract-internal.js'
import type {
  ContractDefinition,
  ContractOfBinding,
  ContractProcedures,
  ProtocolDescriptor,
  ProtocolFactory,
  ResolvedContractNode,
} from './contract.js'

type ImplementationBinding =
  | ContractDefinition
  | ResolvedContractNode<ContractDefinition, 'leaf'>

type ProcedureNamesForProtocol<
  TBinding extends ImplementationBinding,
  TProtocol extends string,
  TContract extends ContractDefinition = ContractOfBinding<TBinding>,
> = {
  [
    K in keyof ContractProcedures<TContract>
  ]: TProtocol extends keyof ContractProcedures<TContract>[K]['protocols']
    ? K
    : never
}[keyof ContractProcedures<TContract>] &
  string

type ImplementationRuntimeShape<
  TBinding extends ImplementationBinding,
  TProtocol extends string,
  TProcedures extends string,
  TContract extends ContractDefinition = ContractOfBinding<TBinding>,
> = {
  [K in TProcedures]: ContractProcedures<TContract>[K]['protocols'][TProtocol &
    keyof ContractProcedures<TContract>[K]['protocols']] extends ProtocolDescriptor<
    TProtocol,
    infer TContext,
    infer TResult,
    any,
    any
  >
    ? (context: TContext) => TResult | Promise<TResult>
    : never
}

export interface ImplementationDescriptor<
  TContract extends ContractDefinition = ContractDefinition,
  TProtocol extends string = string,
  TProcedures extends readonly string[] = readonly string[],
  TRuntime extends object = object,
  TCapabilities extends readonly string[] = readonly string[],
> {
  readonly kind: 'implementation'
  readonly name: string
  readonly contract: TContract
  readonly protocol: TProtocol
  readonly capabilities: TCapabilities
  readonly procedures: TProcedures
  readonly factory: () => TRuntime
}

type AvailableProtocolConstraint<
  TBinding extends ImplementationBinding,
  TProtocol extends string,
  TCapabilities extends readonly string[],
> = [ProcedureNamesForProtocol<TBinding, TProtocol>] extends [never]
  ? never
  : ProtocolFactory<TProtocol, TCapabilities>

type FullImplementationDeclaration<
  TBinding extends ImplementationBinding,
  TProtocol extends string,
  TCapabilities extends readonly string[],
> = {
  readonly name: string
  readonly contract: TBinding
  readonly protocol: AvailableProtocolConstraint<
    TBinding,
    TProtocol,
    TCapabilities
  >
  readonly procedures?: never
}

type DuplicateProcedureNames<
  TProcedures extends readonly string[],
  TSeen extends string = never,
> = number extends TProcedures['length']
  ? never
  : TProcedures extends readonly [
        infer THead extends string,
        ...infer TTail extends readonly string[],
      ]
    ? THead extends TSeen
      ? THead | DuplicateProcedureNames<TTail, TSeen>
      : DuplicateProcedureNames<TTail, TSeen | THead>
    : never

type UniqueProcedureSelectionConstraint<TProcedures extends readonly string[]> =
  [DuplicateProcedureNames<TProcedures>] extends [never]
    ? unknown
    : { readonly __duplicateImplementationProcedure__: never }

type PartialImplementationDeclaration<
  TBinding extends ImplementationBinding,
  TProtocol extends string,
  TProcedures extends readonly ProcedureNamesForProtocol<TBinding, TProtocol>[],
  TCapabilities extends readonly string[],
> = {
  readonly name: string
  readonly contract: TBinding
  readonly protocol: AvailableProtocolConstraint<
    TBinding,
    TProtocol,
    TCapabilities
  >
  readonly procedures: TProcedures &
    UniqueProcedureSelectionConstraint<TProcedures>
}

export interface FullImplementationBuilder<
  TBinding extends ImplementationBinding,
  TProtocol extends string,
  TCapabilities extends readonly string[],
> {
  factory(
    factory: () => ImplementationRuntimeShape<
      TBinding,
      TProtocol,
      ProcedureNamesForProtocol<TBinding, TProtocol>
    >,
  ): ImplementationDescriptor<
    ContractOfBinding<TBinding>,
    TProtocol,
    readonly ProcedureNamesForProtocol<TBinding, TProtocol>[],
    ImplementationRuntimeShape<
      TBinding,
      TProtocol,
      ProcedureNamesForProtocol<TBinding, TProtocol>
    >,
    TCapabilities
  >
}

export interface PartialImplementationBuilder<
  TBinding extends ImplementationBinding,
  TProtocol extends string,
  TProcedures extends readonly ProcedureNamesForProtocol<TBinding, TProtocol>[],
  TCapabilities extends readonly string[],
> {
  factory(
    factory: () => ImplementationRuntimeShape<
      TBinding,
      TProtocol,
      TProcedures[number]
    >,
  ): ImplementationDescriptor<
    ContractOfBinding<TBinding>,
    TProtocol,
    TProcedures,
    ImplementationRuntimeShape<TBinding, TProtocol, TProcedures[number]>,
    TCapabilities
  >
}

export function defineImplementation<
  const TBinding extends ImplementationBinding,
  const TProtocol extends string,
  const TCapabilities extends readonly string[],
>(
  declaration: FullImplementationDeclaration<
    TBinding,
    TProtocol,
    TCapabilities
  >,
): FullImplementationBuilder<TBinding, TProtocol, TCapabilities>
export function defineImplementation<
  const TBinding extends ImplementationBinding,
  const TProtocol extends string,
  const TProcedures extends readonly ProcedureNamesForProtocol<
    TBinding,
    TProtocol
  >[],
  const TCapabilities extends readonly string[],
>(
  declaration: PartialImplementationDeclaration<
    TBinding,
    TProtocol,
    TProcedures,
    TCapabilities
  >,
): PartialImplementationBuilder<TBinding, TProtocol, TProcedures, TCapabilities>
export function defineImplementation(declaration: {
  readonly name: string
  readonly contract: ImplementationBinding
  readonly protocol: ProtocolFactory<string, readonly string[]>
  readonly procedures?: readonly string[]
}): {
  factory(factory: () => object): ImplementationDescriptor
} {
  const protocol = declaration.protocol.protocol
  const contract = contractOfBinding(declaration.contract)

  if (contractNodeMetadataOf(contract)?.kind === 'branch') {
    throw new Error(
      'LUTRE_IMPL_003: Implementation must bind to a resolved leaf Contract node.',
    )
  }

  const available = Object.entries(contract.procedures)
    .filter(([, procedure]) => protocol in procedure.protocols)
    .map(([name]) => name)

  if (available.length === 0) {
    throw new Error(
      `LUTRE_IMPL_003: Contract does not declare any procedure for protocol ${protocol}.`,
    )
  }

  const procedures = [...(declaration.procedures ?? available)]
  const selected = new Set<string>()

  for (const procedure of procedures) {
    if (selected.has(procedure)) {
      throw new Error(
        `LUTRE_IMPL_003: Implementation ${declaration.name} selects procedure ${procedure} more than once.`,
      )
    }
    selected.add(procedure)
    const definition = contract.procedures[procedure]
    if (!definition || !(protocol in definition.protocols)) {
      throw new Error(
        `LUTRE_IMPL_003: ${procedure} is not declared for protocol ${protocol}.`,
      )
    }
  }

  return Object.freeze({
    factory(factory: () => object): ImplementationDescriptor {
      return Object.freeze({
        kind: 'implementation',
        name: declaration.name,
        contract,
        protocol,
        capabilities: declaration.protocol.capabilities ?? [],
        procedures: Object.freeze(procedures),
        factory,
      })
    },
  })
}
