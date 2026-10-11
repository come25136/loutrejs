import { z } from 'zod'
import { readFile } from 'node:fs/promises'
import { parse } from '@swc/core'

const paths = z.array(z.string().min(1)).min(1)
const scalar = z.union([
  z.string().min(1),
  z.strictObject({ input: z.string().min(1), output: z.string().min(1) }),
])
const base = {
  schema: paths,
  scalars: z.record(z.string(), scalar).optional(),
}
export const graphQLCodegenConfig = z.strictObject({
  $schema: z.string().optional(),
  targets: z
    .record(
      z.string().min(1),
      z.discriminatedUnion('kind', [
        z.strictObject({
          ...base,
          kind: z.literal('server'),
          output: z
            .string()
            .min(1)
            .refine(
              (value) => !value.endsWith('.ts'),
              'serverの出力先は生成専用directoryにしてください。',
            ),
          mappers: z.record(z.string(), z.string().min(1)).optional(),
          enumValues: z
            .record(
              z.string(),
              z.union([
                z.string().min(1),
                z.record(z.string(), z.union([z.string(), z.number()])),
              ]),
            )
            .optional(),
        }),
        z.strictObject({
          ...base,
          kind: z.literal('client'),
          output: z
            .string()
            .regex(/\.ts$/, 'clientの出力先は.tsにしてください。'),
          documents: paths,
        }),
      ]),
    )
    .refine(
      (targets) => Object.keys(targets).length > 0,
      'targetを一つ以上指定してください。',
    ),
})
export type GraphQLCodegenConfig = z.infer<typeof graphQLCodegenConfig>
export type GraphQLCodegenTarget = GraphQLCodegenConfig['targets'][string]

function literal(node: any): unknown {
  if (
    node.type === 'TsSatisfiesExpression' ||
    node.type === 'TsAsExpression' ||
    node.type === 'ParenthesisExpression'
  )
    return literal(node.expression)
  if (['StringLiteral', 'NumericLiteral', 'BooleanLiteral'].includes(node.type))
    return node.value
  if (node.type === 'NullLiteral') return null
  if (node.type === 'ArrayExpression')
    return node.elements.map((entry: any) => {
      if (!entry || entry.spread)
        throw new TypeError('Configの配列にspreadは使用できません。')
      return literal(entry.expression)
    })
  if (node.type === 'ObjectExpression') {
    const entries = node.properties.map((property: any) => {
      if (
        property.type !== 'KeyValueProperty' ||
        !['Identifier', 'StringLiteral'].includes(property.key.type)
      )
        throw new TypeError('Configは静的なobject literalにしてください。')
      return [property.key.value, literal(property.value)]
    })
    if (
      new Set(entries.map(([key]: [string, unknown]) => key)).size !==
      entries.length
    )
      throw new TypeError('Configのpropertyが重複しています。')
    return Object.fromEntries(entries)
  }
  throw new TypeError(
    'Configは静的なliteralのみ使用できます。ResolverやApplicationのimport / 実行は行いません。',
  )
}

export async function loadGraphQLConfig(
  path: string,
): Promise<GraphQLCodegenConfig> {
  const content = await readFile(path, 'utf8')
  if (path.endsWith('.json'))
    return graphQLCodegenConfig.parse(JSON.parse(content))
  if (!path.endsWith('.ts'))
    throw new TypeError('Configは.tsまたは.jsonにしてください。')
  const module = await parse(content, { syntax: 'typescript' })
  let value: unknown
  for (const statement of module.body) {
    if (
      statement.type === 'ImportDeclaration' &&
      (statement.typeOnly ||
        (statement.specifiers.length > 0 &&
          statement.specifiers.every((specifier: any) => specifier.isTypeOnly)))
    )
      continue
    if (statement.type !== 'ExportDefaultExpression' || value !== undefined)
      throw new TypeError(
        'Configはexport defaultの静的object literalにしてください。',
      )
    value = literal(statement.expression)
  }
  return graphQLCodegenConfig.parse(value)
}
