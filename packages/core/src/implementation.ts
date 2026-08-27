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
    infer TResult
  >
    ? (context: TContext) => TResult | Promise<TResult>
    : never
}

export interface ImplementationDescriptor<
  TContract extends ContractDefinition = ContractDefinition,
  TProtocol extends string = string,
  TProcedures extends readonly string[] = readonly string[],
  TRuntime extends object = object,
> {
  readonly kind: 'implementation'
  readonly name: string
  readonly contract: TContract
  readonly protocol: TProtocol
  readonly procedures: TProcedures
  readonly factory: () => TRuntime
}

type AvailableProtocolConstraint<
  TContract extends ContractDefinition,
  TProtocol extends string,
> = [ProcedureNamesForProtocol<TContract, TProtocol>] extends [never]
  ? never
  : ProtocolFactory<TProtocol>

type FullImplementationDeclaration<
  TContract extends ContractDefinition,
  TProtocol extends string,
> = {
  readonly name: string
  readonly contract: TContract
  readonly protocol: AvailableProtocolConstraint<TContract, TProtocol>
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
> = {
  readonly name: string
  readonly contract: TContract
  readonly protocol: AvailableProtocolConstraint<TContract, TProtocol>
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
>(
  declaration: FullImplementationDeclaration<TContract, TProtocol>,
): ImplementationDescriptor<
  TContract,
  TProtocol,
  readonly ProcedureNamesForProtocol<TContract, TProtocol>[],
  ImplementationRuntimeShape<
    TContract,
    TProtocol,
    ProcedureNamesForProtocol<TContract, TProtocol>
  >
>
export function implementation<
  const TContract extends ContractDefinition,
  const TProtocol extends string,
  const TProcedures extends readonly ProcedureNamesForProtocol<
    TContract,
    TProtocol
  >[],
>(
  declaration: PartialImplementationDeclaration<
    TContract,
    TProtocol,
    TProcedures
  >,
): ImplementationDescriptor<
  TContract,
  TProtocol,
  TProcedures,
  ImplementationRuntimeShape<TContract, TProtocol, TProcedures[number]>
>
export function implementation(declaration: {
  readonly name: string
  readonly contract: ContractDefinition
  readonly protocol: ProtocolFactory<string>
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
    procedures: Object.freeze(procedures),
    factory: declaration.factory,
  })
}
