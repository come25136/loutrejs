import { z } from 'zod'

const paths = z.array(z.string().min(1)).min(1)
const scalar = z.union([
  z.string().min(1),
  z.strictObject({ input: z.string().min(1), output: z.string().min(1) }),
])
const base = {
  schema: paths,
  output: z.string().regex(/\.ts$/, '出力先は.tsにしてください。'),
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
          contextType: z.string().min(1),
          mappers: z.record(z.string(), z.string().min(1)).optional(),
        }),
        z.strictObject({
          ...base,
          kind: z.literal('client'),
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
