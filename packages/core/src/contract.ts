export interface ProtocolDescriptor<
  TName extends string = string,
  TContext = unknown,
  TResult = unknown,
> {
  readonly kind: 'protocol'
  readonly protocol: TName
  readonly interaction?: InteractionMode
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
  procedures: TProcedures,
  options: { readonly name?: string } = {},
): ContractDefinition<TProcedures> {
  return {
    kind: 'contract',
    ...(options.name === undefined ? {} : { name: options.name }),
    procedures,
  }
}

export type ContractProcedures<TContract extends ContractDefinition> =
  TContract['procedures']

export interface ProtocolFactory<TName extends string> {
  readonly protocol: TName
}
