export interface ProtocolDescriptor<
  TName extends string = string,
  TContext = unknown,
  TResult = unknown,
  TDispatchKey extends string | null = string | null,
  TCapabilities extends readonly string[] = readonly string[],
> {
  readonly kind: 'protocol'
  readonly protocol: TName
  readonly interaction?: InteractionMode
  readonly dispatchKey: TDispatchKey
  readonly capabilities?: TCapabilities
  readonly '~context'?: TContext
  readonly '~result'?: TResult
}

export type InteractionMode =
  | 'unary'
  | 'server-stream'
  | 'client-stream'
  | 'duplex'

export interface ProcedureDefinition<
  TProtocols extends Record<string, ProtocolDescriptor> = Record<
    string,
    ProtocolDescriptor
  >,
> {
  readonly kind: 'procedure'
  readonly protocols: TProtocols
}

export interface ProtocolGroup<
  TName extends string = string,
  TProcedures extends Record<string, ProtocolDescriptor<TName>> = Record<
    string,
    ProtocolDescriptor<TName>
  >,
> {
  readonly kind: 'protocol-group'
  readonly protocol: TName
  readonly procedures: TProcedures
}

export function protocolGroup<
  const TName extends string,
  const TProcedures extends Record<string, ProtocolDescriptor<TName>>,
>(protocol: TName, procedures: TProcedures): ProtocolGroup<TName, TProcedures> {
  return Object.freeze({
    kind: 'protocol-group',
    protocol,
    procedures: Object.freeze({ ...procedures }),
  })
}

export interface ContractDefinition<
  TProcedures extends Record<string, ProcedureDefinition> = Record<
    string,
    ProcedureDefinition
  >,
> {
  readonly kind: 'contract'
  readonly name?: string
  readonly procedures: TProcedures
}

type ProcedureNamesOfGroup<TGroup> =
  TGroup extends ProtocolGroup<string, infer TProcedures>
    ? keyof TProcedures & string
    : never

type ProcedureNamesOfGroups<TGroups extends readonly ProtocolGroup[]> =
  ProcedureNamesOfGroup<TGroups[number]>

type ProtocolOfGroupProcedure<TGroup, TProcedure extends string> =
  TGroup extends ProtocolGroup<infer TProtocol, infer TProcedures>
    ? TProcedure extends keyof TProcedures
      ? { readonly [K in TProtocol]: TProcedures[TProcedure] }
      : never
    : never

type ProceduresFromGroups<TGroups extends readonly ProtocolGroup[]> = {
  [TProcedure in ProcedureNamesOfGroups<TGroups>]: ProcedureDefinition<
    UnionToIntersection<
      ProtocolOfGroupProcedure<TGroups[number], TProcedure>
    > extends infer TProtocols extends Record<string, ProtocolDescriptor>
      ? TProtocols
      : never
  >
}

function defineContract<
  const TGroups extends readonly [ProtocolGroup, ...ProtocolGroup[]],
>(
  ...groups: TGroups &
    DispatchKeyUniquenessConstraint<ProceduresFromGroups<TGroups>>
): ContractDefinition<ProceduresFromGroups<TGroups>>
function defineContract<
  const TGroups extends readonly [ProtocolGroup, ...ProtocolGroup[]],
>(
  ...args: [...TGroups, ContractOptions] &
    DispatchKeyUniquenessConstraint<ProceduresFromGroups<TGroups>>
): ContractDefinition<ProceduresFromGroups<TGroups>>
function defineContract(
  ...args: readonly (ProtocolGroup | ContractOptions)[]
): ContractDefinition {
  const last = args.at(-1)
  const hasOptions = last !== undefined && !('kind' in last)
  const options = hasOptions ? (last as ContractOptions) : {}
  const groups = (
    hasOptions ? args.slice(0, -1) : args
  ) as readonly ProtocolGroup[]

  if (groups.length === 0) {
    throw new Error('contract() requires at least one protocol group')
  }

  const procedures: Record<string, ProcedureDefinition> = {}
  for (const group of groups) {
    for (const [procedureName, descriptor] of Object.entries(
      group.procedures,
    )) {
      const current = procedures[procedureName]
      if (Object.hasOwn(current?.protocols ?? {}, group.protocol)) {
        throw new Error(
          `Duplicate contract procedure protocol: ${procedureName}.${group.protocol}`,
        )
      }
      procedures[procedureName] = {
        kind: 'procedure',
        protocols: {
          ...current?.protocols,
          [group.protocol]: descriptor,
        },
      }
    }
  }

  assertUniqueDispatchKeys(procedures, options.name)
  return Object.freeze({
    kind: 'contract',
    ...(options.name === undefined ? {} : { name: options.name }),
    procedures: Object.freeze(procedures),
  })
}

export type ProtocolProcedures<
  TName extends string,
  TDescriptors extends Record<string, ProtocolDescriptor<TName>>,
> = {
  [K in keyof TDescriptors]: ProcedureDefinition<{
    readonly [P in TName]: TDescriptors[K]
  }>
}

export type ProtocolContractConstraint<
  TName extends string,
  TDescriptors extends Record<string, ProtocolDescriptor<TName>>,
> = DispatchKeyUniquenessConstraint<ProtocolProcedures<TName, TDescriptors>>

export function defineProtocolContract<
  const TName extends string,
  const TDescriptors extends Record<string, ProtocolDescriptor<TName>>,
>(
  group: ProtocolGroup<TName, TDescriptors> &
    ProtocolContractConstraint<TName, TDescriptors>,
  options: ContractOptions = {},
): ContractDefinition<ProtocolProcedures<TName, TDescriptors>> {
  return (
    defineContract as (
      group: ProtocolGroup,
      options: ContractOptions,
    ) => ContractDefinition
  )(group, options) as ContractDefinition<
    ProtocolProcedures<TName, TDescriptors>
  >
}

type ProcedureNamesOfContract<TContract> =
  TContract extends ContractDefinition<infer TProcedures>
    ? keyof TProcedures & string
    : never

type ProcedureNamesOfContracts<
  TContracts extends readonly ContractDefinition[],
> = ProcedureNamesOfContract<TContracts[number]>

type ProtocolsOfContractProcedure<TContract, TProcedure extends string> =
  TContract extends ContractDefinition<infer TProcedures>
    ? TProcedure extends keyof TProcedures
      ? TProcedures[TProcedure]['protocols']
      : never
    : never

type UnionToIntersection<T> = (
  T extends unknown ? (value: T) => void : never
) extends (value: infer TIntersection) => void
  ? TIntersection
  : never

type MergedProcedures<TContracts extends readonly ContractDefinition[]> = {
  [TProcedure in ProcedureNamesOfContracts<TContracts>]: ProcedureDefinition<
    UnionToIntersection<
      ProtocolsOfContractProcedure<TContracts[number], TProcedure>
    > extends infer TProtocols extends Record<string, ProtocolDescriptor>
      ? TProtocols
      : never
  >
}

export interface ContractOptions {
  readonly name?: string
}

function mergeContracts<
  const TContracts extends readonly [
    ContractDefinition,
    ...ContractDefinition[],
  ],
>(...contracts: TContracts): ContractDefinition<MergedProcedures<TContracts>>
function mergeContracts<
  const TContracts extends readonly [
    ContractDefinition,
    ...ContractDefinition[],
  ],
>(
  ...args: [...TContracts, ContractOptions]
): ContractDefinition<MergedProcedures<TContracts>>
function mergeContracts(
  ...args: readonly (ContractDefinition | ContractOptions)[]
): ContractDefinition {
  const last = args.at(-1)
  const hasOptions = last !== undefined && !('kind' in last)
  const options = hasOptions ? (last as ContractOptions) : {}
  const contracts = (
    hasOptions ? args.slice(0, -1) : args
  ) as readonly ContractDefinition[]
  if (contracts.length === 0) {
    throw new Error('contract.merge() requires at least one Contract')
  }

  const procedures: Record<string, ProcedureDefinition> = {}

  for (const source of contracts) {
    for (const [procedureName, procedureDefinition] of Object.entries(
      source.procedures,
    )) {
      const current = procedures[procedureName]
      const protocols = { ...current?.protocols }
      for (const [protocolName, descriptor] of Object.entries(
        procedureDefinition.protocols,
      )) {
        if (Object.hasOwn(protocols, protocolName)) {
          throw new Error(
            `Duplicate contract procedure protocol: ${procedureName}.${protocolName}`,
          )
        }
        protocols[protocolName] = descriptor
      }
      procedures[procedureName] = { kind: 'procedure', protocols }
    }
  }

  assertUniqueDispatchKeys(procedures, options.name)
  return Object.freeze({
    kind: 'contract',
    ...(options.name === undefined ? {} : { name: options.name }),
    procedures: Object.freeze(procedures),
  })
}

export const contract = Object.freeze({
  merge: mergeContracts,
})

type ProtocolDispatchEntries<
  TProcedures extends Record<string, ProcedureDefinition>,
> = {
  [TProcedure in keyof TProcedures & string]: {
    [
      TProtocol in keyof TProcedures[TProcedure]['protocols'] & string
    ]: TProcedures[TProcedure]['protocols'][TProtocol] extends {
      readonly dispatchKey: infer TDispatchKey extends string | null
    }
      ? TDispatchKey extends string
        ? {
            readonly key: TDispatchKey
            readonly path: `${TProcedure}.${TProtocol}`
          }
        : never
      : never
  }[keyof TProcedures[TProcedure]['protocols'] & string]
}[keyof TProcedures & string]

type IsUnion<TValue, TCandidate = TValue> = TValue extends unknown
  ? [TCandidate] extends [TValue]
    ? false
    : true
  : never

type DuplicateDispatchKeys<
  TEntries,
  TAllEntries = TEntries,
> = TEntries extends {
  readonly key: infer TKey extends string
}
  ? string extends TKey
    ? never
    : IsUnion<
          Extract<TAllEntries, { readonly key: TKey }> extends {
            readonly path: infer TPath
          }
            ? TPath
            : never
        > extends true
      ? TKey
      : never
  : never

type DispatchKeyUniquenessConstraint<
  TProcedures extends Record<string, ProcedureDefinition>,
> = [DuplicateDispatchKeys<ProtocolDispatchEntries<TProcedures>>] extends [
  never,
]
  ? unknown
  : {
      readonly __duplicateProtocolDispatchKey__: DuplicateDispatchKeys<
        ProtocolDispatchEntries<TProcedures>
      >
    }

function assertUniqueDispatchKeys(
  procedures: Record<string, ProcedureDefinition>,
  contractName: string | undefined,
): void {
  const paths = new Map<string, string>()
  for (const [procedureName, procedureDefinition] of Object.entries(
    procedures,
  )) {
    for (const [protocolName, protocol] of Object.entries(
      procedureDefinition.protocols,
    )) {
      const dispatchKey = protocol.dispatchKey
      if (dispatchKey === null) continue
      if (typeof dispatchKey !== 'string') {
        throw new Error(
          `Protocol dispatchKey must be a string or null: ${procedureName}.${protocolName}`,
        )
      }
      const path = `${contractName ?? 'Contract'}.${procedureName}.${protocolName}`
      const existing = paths.get(dispatchKey)
      if (existing) {
        throw new Error(
          `Duplicate protocol dispatch key "${dispatchKey}" between ${existing} and ${path}`,
        )
      }
      paths.set(dispatchKey, path)
    }
  }
}

export type ContractProcedures<TContract extends ContractDefinition> =
  TContract['procedures']

export interface ProtocolFactory<
  TName extends string,
  TCapabilities extends readonly string[] = readonly string[],
> {
  readonly protocol: TName
  readonly capabilities?: TCapabilities
}
