import type { GraphQLResolveInfo, GraphQLSchema } from 'graphql'
import type { FieldOptions } from './data-types.js'

export interface DataDefinition {
  readonly identity: string
  readonly options: FieldOptions<any, any, any, any>
}
const schemas = new WeakMap<
  GraphQLSchema,
  ReadonlyMap<string, DataDefinition>
>()
export function registerSchemaMetadata(
  schema: GraphQLSchema,
  metadata: ReadonlyMap<string, DataDefinition>,
) {
  schemas.set(schema, metadata)
}
export function getSchemaMetadata(schema: GraphQLSchema) {
  return schemas.get(schema)
}
type Invoke = (
  definition: DataDefinition,
  parent: unknown,
  args: unknown,
  context: unknown,
  info: GraphQLResolveInfo,
) => unknown
const executors = new WeakMap<object, Invoke>()
export function registerExecutor(context: object, invoke: Invoke) {
  executors.set(context, invoke)
}
export function invokeData(
  definition: DataDefinition,
  parent: unknown,
  args: unknown,
  context: unknown,
  info: GraphQLResolveInfo,
) {
  const executor =
    typeof context === 'object' && context !== null
      ? executors.get(context)
      : undefined
  if (!executor)
    throw new TypeError(
      'Batch ResolverはBinding済みManifestのExecution Adapter内で実行してください。',
    )
  return executor(definition, parent, args, context, info)
}
