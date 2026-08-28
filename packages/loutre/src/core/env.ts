import type { Class } from './token.js'
import {
  validateSchema,
  type SchemaOutput,
  type StandardSchemaV1,
} from './schema.js'
import type { RuntimeInputKey } from './runtime-input.js'

export type EnvSchema = StandardSchemaV1<unknown, object>

export type EnvKey<TValue = unknown> = RuntimeInputKey<TValue> & {
  readonly source: 'environment'
  readonly contract: EnvClass
}

export interface EnvClass<TSchema extends EnvSchema = EnvSchema> extends Class<
  SchemaOutput<TSchema>
> {
  readonly kind: 'environment'
  readonly schema: TSchema
  key<TKey extends keyof SchemaOutput<TSchema> & string>(
    key: TKey,
  ): EnvKey<SchemaOutput<TSchema>[TKey]>
}

export function defineEnv<TSchema extends EnvSchema>(
  schema: TSchema,
): EnvClass<TSchema> {
  class DefinedEnv {
    static readonly kind = 'environment' as const
    static readonly schema = schema

    static key<TKey extends keyof SchemaOutput<TSchema> & string>(
      this: EnvClass<TSchema>,
      key: TKey,
    ): EnvKey<SchemaOutput<TSchema>[TKey]> {
      return {
        kind: 'runtime-input-key',
        source: 'environment',
        contract: this,
        key,
      }
    }

    constructor(values: SchemaOutput<TSchema>) {
      Object.assign(this, values)
    }
  }

  return DefinedEnv as unknown as EnvClass<TSchema>
}

export function isEnvClass(value: unknown): value is EnvClass {
  return (
    typeof value === 'function' &&
    (value as Partial<EnvClass>).kind === 'environment' &&
    'schema' in value &&
    typeof (value as Partial<EnvClass>).key === 'function'
  )
}

export async function loadEnv<TSchema extends EnvSchema>(
  Env: EnvClass<TSchema>,
  source: unknown,
): Promise<InstanceType<EnvClass<TSchema>>> {
  const values = await validateSchema(Env.schema, source)
  return new Env(values) as InstanceType<EnvClass<TSchema>>
}
