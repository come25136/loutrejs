import type { GraphQLRuntime, GraphQLStateInput } from './types.js'

export async function prepareState(
  runtime: GraphQLRuntime,
  input: GraphQLStateInput,
  inherited: Readonly<Record<string, unknown>> = {},
): Promise<Readonly<Record<string, unknown>> | Response> {
  const prepared = runtime.state ? await runtime.state(input) : {}
  if (prepared instanceof Response) return prepared
  if (
    prepared === null ||
    typeof prepared !== 'object' ||
    Array.isArray(prepared) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(prepared))
  )
    throw new TypeError(
      'GraphQL stateの前処理はオブジェクトかResponseを返してください。',
    )
  for (const key of Object.keys(prepared)) {
    if (key === '__proto__' || Object.hasOwn(inherited, key))
      throw new TypeError(`GraphQL stateのキーを上書きできません: ${key}`)
  }
  return Object.freeze({ ...inherited, ...prepared })
}
