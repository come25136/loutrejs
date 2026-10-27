import type { Class } from './token.js'
import {
  validateSchema,
  type SchemaOutput,
  type StandardSchemaV1,
} from './schema.js'
import type { RuntimeInputKey } from './runtime-input.js'

export type ArgsSchema = StandardSchemaV1<unknown, object>

export type ArgsKey<TValue = unknown> = RuntimeInputKey<TValue> & {
  readonly source: 'arguments'
  readonly contract: ArgsClass
}

export interface ArgsClass<
  TSchema extends ArgsSchema = ArgsSchema,
> extends Class<SchemaOutput<TSchema>> {
  readonly '~loutre.descriptor': 'args'
  readonly kind: 'arguments'
  readonly schema: TSchema
  key<TKey extends keyof SchemaOutput<TSchema> & string>(
    key: TKey,
  ): ArgsKey<SchemaOutput<TSchema>[TKey]>
}

export function defineArgs<TSchema extends ArgsSchema>(
  schema: TSchema,
): ArgsClass<TSchema> {
  class DefinedArgs {
    declare static readonly '~loutre.descriptor': 'args'
    static readonly kind = 'arguments' as const
    static readonly schema = schema

    static key<TKey extends keyof SchemaOutput<TSchema> & string>(
      this: ArgsClass<TSchema>,
      key: TKey,
    ): ArgsKey<SchemaOutput<TSchema>[TKey]> {
      const descriptor: Omit<
        ArgsKey<SchemaOutput<TSchema>[TKey]>,
        '~loutre.descriptor'
      > = {
        kind: 'runtime-input-key',
        source: 'arguments',
        contract: this,
        key,
      }
      return descriptor as ArgsKey<SchemaOutput<TSchema>[TKey]>
    }

    constructor(values: SchemaOutput<TSchema>) {
      Object.assign(this, values)
    }
  }

  return DefinedArgs as ArgsClass<TSchema>
}

export function isArgsClass(value: unknown): value is ArgsClass {
  return (
    typeof value === 'function' &&
    (value as Partial<ArgsClass>).kind === 'arguments' &&
    'schema' in value &&
    typeof (value as Partial<ArgsClass>).key === 'function'
  )
}

export async function loadArgs<TSchema extends ArgsSchema>(
  Args: ArgsClass<TSchema>,
  source: unknown,
): Promise<InstanceType<ArgsClass<TSchema>>> {
  const values = await validateSchema(Args.schema, source)
  return new Args(values) as InstanceType<ArgsClass<TSchema>>
}
