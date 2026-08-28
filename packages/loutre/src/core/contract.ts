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

export function procedure<
  const TProtocols extends Record<string, ProtocolDescriptor>,
>(definition: {
  readonly protocols: TProtocols
}): ProcedureDefinition<TProtocols> {
  return { kind: 'procedure', protocols: definition.protocols }
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

export function contract<
  const TProcedures extends Record<string, ProcedureDefinition>,
>(
  procedures: TProcedures & DispatchKeyUniquenessConstraint<TProcedures>,
  options: { readonly name?: string } = {},
): ContractDefinition<TProcedures> {
  assertUniqueDispatchKeys(procedures, options.name)
  return {
    kind: 'contract',
    ...(options.name === undefined ? {} : { name: options.name }),
    procedures,
  }
}

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
