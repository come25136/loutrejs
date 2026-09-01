import { contractOfBinding } from './contract-internal.js'
import type {
  ContractBinding,
  ContractDefinition,
  ContractOfBinding,
  ContractProcedures,
  ProtocolDescriptor,
  ProtocolFactory,
} from './contract.js'

type ProcedureNamesForProtocol<
  TBinding extends ContractBinding,
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
  TBinding extends ContractBinding,
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
  TBinding extends ContractBinding,
  TProtocol extends string,
  TCapabilities extends readonly string[],
> = [ProcedureNamesForProtocol<TBinding, TProtocol>] extends [never]
  ? never
  : ProtocolFactory<TProtocol, TCapabilities>

type FullImplementationDeclaration<
  TBinding extends ContractBinding,
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
  readonly factory: () => ImplementationRuntimeShape<
    TBinding,
    TProtocol,
    ProcedureNamesForProtocol<TBinding, TProtocol>
  >
}

type PartialImplementationDeclaration<
  TBinding extends ContractBinding,
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
  readonly procedures: TProcedures
  readonly factory: () => ImplementationRuntimeShape<
    TBinding,
    TProtocol,
    TProcedures[number]
  >
}

export function implementation<
  const TBinding extends ContractBinding,
  const TProtocol extends string,
  const TCapabilities extends readonly string[],
>(
  declaration: FullImplementationDeclaration<
    TBinding,
    TProtocol,
    TCapabilities
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
export function implementation<
  const TBinding extends ContractBinding,
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
): ImplementationDescriptor<
  ContractOfBinding<TBinding>,
  TProtocol,
  TProcedures,
  ImplementationRuntimeShape<TBinding, TProtocol, TProcedures[number]>,
  TCapabilities
>
export function implementation(declaration: {
  readonly name: string
  readonly contract: ContractBinding
  readonly protocol: ProtocolFactory<string, readonly string[]>
  readonly procedures?: readonly string[]
  readonly factory: () => object
}): ImplementationDescriptor {
  const protocol = declaration.protocol.protocol
  const contract = contractOfBinding(declaration.contract)
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
    kind: 'implementation',
    name: declaration.name,
    contract,
    protocol,
    capabilities: declaration.protocol.capabilities ?? [],
    procedures: Object.freeze(procedures),
    factory: declaration.factory,
  })
}
