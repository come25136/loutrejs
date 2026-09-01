import {
  contractNodeBinding,
  protocolNamespaceBuilder,
  protocolNamespaceType,
} from './contract-internal.js'

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
  readonly procedures: TProcedures
}

export interface ResolvedContractNode<
  TContract extends ContractDefinition = ContractDefinition,
> {
  readonly [contractNodeBinding]: TContract
}

export type ContractBinding = ContractDefinition | ResolvedContractNode

export type ContractOfBinding<TBinding extends ContractBinding> =
  TBinding extends ResolvedContractNode<infer TContract>
    ? TContract
    : TBinding extends ContractDefinition
      ? TBinding
      : never

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

type NonEmptyArrayConstraint<TValues extends readonly unknown[]> =
  TValues extends readonly []
    ? { readonly __requiresAtLeastOneEntry__: never }
    : unknown

type ProcedureProtocolKeysOfGroup<TGroup> =
  TGroup extends ProtocolGroup<infer TProtocol, infer TProcedures>
    ? `${keyof TProcedures & string}.${TProtocol}`
    : never

type DuplicateGroupProcedureProtocolKeys<
  TGroups extends readonly ProtocolGroup[],
  TSeen extends string = never,
> = number extends TGroups['length']
  ? never
  : TGroups extends readonly [
        infer THead extends ProtocolGroup,
        ...infer TTail extends readonly ProtocolGroup[],
      ]
    ?
        | Extract<ProcedureProtocolKeysOfGroup<THead>, TSeen>
        | DuplicateGroupProcedureProtocolKeys<
            TTail,
            TSeen | ProcedureProtocolKeysOfGroup<THead>
          >
    : never

type ProtocolNamespaceOfGroup<TGroup> = TGroup extends {
  readonly protocol: infer TProtocol extends string
  readonly procedures: infer TProcedures
}
  ? TProcedures extends object
    ? TProcedures[keyof TProcedures] extends {
        readonly [protocolNamespaceType]: infer TNamespace
      }
      ? [TNamespace] extends [never]
        ? never
        : { readonly [K in TProtocol]: TNamespace }
      : never
    : never
  : never

type ProtocolNamespacesOfGroups<TGroups extends readonly ProtocolGroup[]> = [
  ProtocolNamespaceOfGroup<TGroups[number]>,
] extends [never]
  ? unknown
  : UnionToIntersection<ProtocolNamespaceOfGroup<TGroups[number]>>

type ContractFromGroups<TGroups extends readonly ProtocolGroup[]> =
  ContractDefinition<ProceduresFromGroups<TGroups>> &
    ProtocolNamespacesOfGroups<TGroups>

type ContractGroupsOf<TGroups extends readonly unknown[]> =
  TGroups extends readonly ProtocolGroup[] ? TGroups : never

type ContractArgumentValidation<TGroups extends readonly unknown[]> =
  TGroups extends readonly []
    ? readonly [error: 'contract requires at least one protocol group']
    : TGroups extends readonly ProtocolGroup[]
      ? [DuplicateGroupProcedureProtocolKeys<TGroups>] extends [never]
        ? [
            DuplicateDispatchKeys<
              ProtocolDispatchEntries<ProceduresFromGroups<TGroups>>
            >,
          ] extends [never]
          ? readonly []
          : readonly [error: 'contract contains duplicate dispatch keys']
        : readonly [error: 'contract contains duplicate procedure protocols']
      : readonly [error: 'contract entries must be protocol groups']

function defineContract<const TGroups extends readonly unknown[]>(
  groups: TGroups,
  ...validation: ContractArgumentValidation<TGroups>
): ContractFromGroups<ContractGroupsOf<TGroups>>
function defineContract(
  groups: readonly ProtocolGroup[],
  ..._validation: readonly unknown[]
): ContractDefinition & Record<string, unknown> {
  if (groups.length === 0) {
    throw new Error('contract([]) requires at least one protocol group')
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

  assertUniqueDispatchKeys(procedures)
  const resolved = {
    kind: 'contract' as const,
    procedures: Object.freeze(procedures),
  } as ContractDefinition & Record<PropertyKey, unknown>

  for (const group of groups) {
    const buildNamespace = (
      group as ProtocolGroup & Record<PropertyKey, unknown>
    )[protocolNamespaceBuilder]
    if (typeof buildNamespace !== 'function') continue
    const namespace = Reflect.apply(buildNamespace, undefined, [resolved])
    const current = resolved[group.protocol]
    if (current === undefined) {
      resolved[group.protocol] = namespace
      continue
    }
    if (!isRecord(current) || !isRecord(namespace)) {
      throw new Error(
        `Duplicate contract protocol namespace: ${group.protocol}`,
      )
    }
    for (const name of Object.keys(namespace)) {
      if (Object.hasOwn(current, name)) {
        throw new Error(
          `Duplicate contract protocol namespace node: ${group.protocol}.${name}`,
        )
      }
    }
    resolved[group.protocol] = Object.freeze({ ...current, ...namespace })
  }

  return Object.freeze(resolved)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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

type ProcedureProtocolKeysOfContract<TContract> =
  TContract extends ContractDefinition<infer TProcedures>
    ? {
        [
          TProcedure in keyof TProcedures & string
        ]: `${TProcedure}.${keyof TProcedures[TProcedure]['protocols'] &
          string}`
      }[keyof TProcedures & string]
    : never

type DuplicateContractProcedureProtocolKeys<
  TContracts extends readonly ContractDefinition[],
  TSeen extends string = never,
> = number extends TContracts['length']
  ? never
  : TContracts extends readonly [
        infer THead extends ContractDefinition,
        ...infer TTail extends readonly ContractDefinition[],
      ]
    ?
        | Extract<ProcedureProtocolKeysOfContract<THead>, TSeen>
        | DuplicateContractProcedureProtocolKeys<
            TTail,
            TSeen | ProcedureProtocolKeysOfContract<THead>
          >
    : never

type ContractProcedureProtocolUniquenessConstraint<
  TContracts extends readonly ContractDefinition[],
> = [DuplicateContractProcedureProtocolKeys<TContracts>] extends [never]
  ? unknown
  : {
      readonly __duplicateProcedureProtocol__: DuplicateContractProcedureProtocolKeys<TContracts>
    }

function mergeContracts<const TContracts extends readonly ContractDefinition[]>(
  contracts: TContracts &
    NonEmptyArrayConstraint<TContracts> &
    ContractProcedureProtocolUniquenessConstraint<TContracts> &
    DispatchKeyUniquenessConstraint<MergedProcedures<TContracts>>,
): ContractDefinition<MergedProcedures<TContracts>> {
  if (contracts.length === 0) {
    throw new Error('contract.merge([]) requires at least one Contract')
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

  assertUniqueDispatchKeys(procedures)
  return Object.freeze({
    kind: 'contract',
    procedures: Object.freeze(procedures),
  }) as unknown as ContractDefinition<MergedProcedures<TContracts>>
}

export const contract = Object.assign(defineContract, {
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
      const path = `${procedureName}.${protocolName}`
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
