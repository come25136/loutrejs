import type { Class } from './token.js'
import {
  validateSchema,
  type SchemaOutput,
  type StandardSchemaV1,
} from './schema.js'

export interface EnvKey<TValue = unknown> {
  readonly kind: 'env-key'
  readonly env: Class
  readonly key: string
  readonly '~value'?: TValue
}

export interface EnvClass<
  TSchema extends StandardSchemaV1 = StandardSchemaV1,
> extends Class<SchemaOutput<TSchema>> {
  readonly schema: TSchema
  key<TKey extends keyof SchemaOutput<TSchema> & string>(
    key: TKey,
  ): EnvKey<SchemaOutput<TSchema>[TKey]>
}

export function defineEnv<TSchema extends StandardSchemaV1>(
  schema: TSchema,
): EnvClass<TSchema> {
  class DefinedEnv {
    static readonly schema = schema

    static key<TKey extends keyof SchemaOutput<TSchema> & string>(
      this: Class,
      key: TKey,
    ): EnvKey<SchemaOutput<TSchema>[TKey]> {
      return { kind: 'env-key', env: this, key }
    }

    constructor(values: SchemaOutput<TSchema>) {
      Object.assign(this, values)
    }
  }

  return DefinedEnv as unknown as EnvClass<TSchema>
}

export async function loadEnv<TSchema extends StandardSchemaV1>(
  Env: EnvClass<TSchema>,
  source: unknown,
): Promise<InstanceType<EnvClass<TSchema>>> {
  const values = await validateSchema(Env.schema, source)
  return new Env(values) as InstanceType<EnvClass<TSchema>>
}
