import type {
  ContractDefinition,
  ContractProcedures,
  ProtocolDescriptor,
  ProtocolFactory,
} from './contract.js'

type ProcedureNamesForProtocol<
  TContract extends ContractDefinition,
  TProtocol extends string,
> = {
  [
    K in keyof ContractProcedures<TContract>
  ]: TProtocol extends keyof ContractProcedures<TContract>[K]['protocols']
    ? K
    : never
}[keyof ContractProcedures<TContract>] &
  string

type ImplementationRuntimeShape<
  TContract extends ContractDefinition,
  TProtocol extends string,
  TProcedures extends string,
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
  TContract extends ContractDefinition,
  TProtocol extends string,
  TCapabilities extends readonly string[],
> = [ProcedureNamesForProtocol<TContract, TProtocol>] extends [never]
  ? never
  : ProtocolFactory<TProtocol, TCapabilities>

type FullImplementationDeclaration<
  TContract extends ContractDefinition,
  TProtocol extends string,
  TCapabilities extends readonly string[],
> = {
  readonly name: string
  readonly contract: TContract
  readonly protocol: AvailableProtocolConstraint<
    TContract,
    TProtocol,
    TCapabilities
  >
  readonly procedures?: never
  readonly factory: () => ImplementationRuntimeShape<
    TContract,
    TProtocol,
    ProcedureNamesForProtocol<TContract, TProtocol>
  >
}

type PartialImplementationDeclaration<
  TContract extends ContractDefinition,
  TProtocol extends string,
  TProcedures extends readonly ProcedureNamesForProtocol<
    TContract,
    TProtocol
  >[],
  TCapabilities extends readonly string[],
> = {
  readonly name: string
  readonly contract: TContract
  readonly protocol: AvailableProtocolConstraint<
    TContract,
    TProtocol,
    TCapabilities
  >
  readonly procedures: TProcedures
  readonly factory: () => ImplementationRuntimeShape<
    TContract,
    TProtocol,
    TProcedures[number]
  >
}

export function implementation<
  const TContract extends ContractDefinition,
  const TProtocol extends string,
  const TCapabilities extends readonly string[],
>(
  declaration: FullImplementationDeclaration<
    TContract,
    TProtocol,
    TCapabilities
  >,
): ImplementationDescriptor<
  TContract,
  TProtocol,
  readonly ProcedureNamesForProtocol<TContract, TProtocol>[],
  ImplementationRuntimeShape<
    TContract,
    TProtocol,
    ProcedureNamesForProtocol<TContract, TProtocol>
  >,
  TCapabilities
>
export function implementation<
  const TContract extends ContractDefinition,
  const TProtocol extends string,
  const TProcedures extends readonly ProcedureNamesForProtocol<
    TContract,
    TProtocol
  >[],
  const TCapabilities extends readonly string[],
>(
  declaration: PartialImplementationDeclaration<
    TContract,
    TProtocol,
    TProcedures,
    TCapabilities
  >,
): ImplementationDescriptor<
  TContract,
  TProtocol,
  TProcedures,
  ImplementationRuntimeShape<TContract, TProtocol, TProcedures[number]>,
  TCapabilities
>
export function implementation(declaration: {
  readonly name: string
  readonly contract: ContractDefinition
  readonly protocol: ProtocolFactory<string, readonly string[]>
  readonly procedures?: readonly string[]
  readonly factory: () => object
}): ImplementationDescriptor {
  const protocol = declaration.protocol.protocol
  const available = Object.entries(declaration.contract.procedures)
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
    const definition = declaration.contract.procedures[procedure]
    if (!definition || !(protocol in definition.protocols)) {
      throw new Error(
        `LUTRE_IMPL_003: ${procedure} is not declared for protocol ${protocol}.`,
      )
    }
  }

  return Object.freeze({
    kind: 'implementation',
    name: declaration.name,
    contract: declaration.contract,
    protocol,
    capabilities: declaration.protocol.capabilities ?? [],
    procedures: Object.freeze(procedures),
    factory: declaration.factory,
  })
}
