import type {
  ContractDefinition,
  ContractProcedures,
  ProtocolDescriptor,
  ProtocolFactory,
} from './contract.js'
import type { Class } from './token.js'

export interface ImplementationBinding {
  readonly kind: 'implementation'
  readonly contract: ContractDefinition
  readonly protocol: string
  readonly procedures?: readonly string[]
  readonly implementation: Class
}

type ProcedureNamesForProtocol<
  TContract extends ContractDefinition,
  TProtocol extends string,
> = {
  [K in keyof ContractProcedures<TContract>]:
    TProtocol extends keyof ContractProcedures<TContract>[K]['protocols'] ? K : never
}[keyof ContractProcedures<TContract>] & string

type ImplementationShape<
  TContract extends ContractDefinition,
  TProtocol extends string,
  TProcedures extends string,
> = {
  [K in TProcedures]: ContractProcedures<TContract>[K]['protocols'][TProtocol & keyof ContractProcedures<TContract>[K]['protocols']] extends ProtocolDescriptor<
    TProtocol,
    infer TContext,
    infer TResult
  >
    ? (context: TContext) => TResult | Promise<TResult>
    : never
}

export function implement<TContract extends ContractDefinition>(
  contract: TContract,
) {
  return {
    for<TProtocol extends string>(protocol: ProtocolFactory<TProtocol>) {
      const create = <TProcedures extends string | undefined>(
        procedures: readonly string[] | undefined,
      ) => ({
        with<
          TImplementation extends Class<
            ImplementationShape<
              TContract,
              TProtocol,
              TProcedures extends string
                ? TProcedures
                : ProcedureNamesForProtocol<TContract, TProtocol>
            >
          >,
        >(
          implementation: TImplementation,
        ): ImplementationBinding {
          return {
            kind: 'implementation',
            contract,
            protocol: protocol.protocol,
            ...(procedures === undefined ? {} : { procedures }),
            implementation,
          }
        },
      })

      return {
        ...create<undefined>(undefined),
        procedures<
          const TNames extends readonly ProcedureNamesForProtocol<
            TContract,
            TProtocol
          >[],
        >(...procedures: TNames) {
          return create<TNames[number]>(procedures)
        },
      }
    },
  }
}
