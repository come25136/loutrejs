import type { GraphQLResolveInfo } from 'graphql'
import type { FieldOptions, SourceInput } from './data-types.js'

export type DataDefinition = {
  readonly identity: string
  readonly fingerprint: string
} & (
  | {
      readonly kind: 'field'
      readonly options: FieldOptions<any, any, any, any>
    }
  | {
      readonly kind: 'source'
      readonly source: (
        input: SourceInput<unknown, unknown, unknown>,
      ) => unknown
    }
)

const definitions = new WeakMap<Function, DataDefinition>()
type Invoke = (
  definition: DataDefinition,
  parent: unknown,
  args: unknown,
  context: unknown,
  info: GraphQLResolveInfo,
) => unknown
const executors = new WeakMap<object, Invoke>()

export function registerData(resolver: Function, definition: DataDefinition) {
  definitions.set(resolver, definition)
}
export function getData(resolver: unknown) {
  return typeof resolver === 'function' ? definitions.get(resolver) : undefined
}
export function inheritData(source: Function, target: Function) {
  const definition = getData(source)
  if (definition) registerData(target, definition)
}
export function registerExecutor(context: object, invoke: Invoke) {
  executors.set(context, invoke)
}
export function invokeData(
  resolver: Function,
  parent: unknown,
  args: unknown,
  context: unknown,
  info: GraphQLResolveInfo,
  identity: string,
) {
  const executor =
    typeof context === 'object' && context !== null
      ? executors.get(context)
      : undefined
  const definition = getData(resolver)
  if (!executor || !definition || definition.identity !== identity)
    throw new TypeError(
      'Data Resolverは生成ManifestのExecution Adapter内で実行してください。',
    )
  return executor(definition, parent, args, context, info)
}
