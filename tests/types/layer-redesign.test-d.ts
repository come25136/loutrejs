import { defineLayer, inject, token } from '@loutrejs/loutre'

interface Lookup {
  find(value: string): number
}
const LOOKUP = token<Lookup>('lookup')

const source = defineLayer({ name: 'source' }).factory<{
  source: { value: string }
}>(() => async (_ctx, next) => {
  const result: Promise<void> = next({ source: { value: 'ready' } })
  await result
  // @ts-expect-error contributionを宣言したLayerではnext引数が必須
  await next()
})

const typed = defineLayer({
  name: 'typed-layer',
  requires: [source],
}).factory<{
  derived: { count: number }
}>((lookup = inject(LOOKUP)) => async (ctx, next) => {
  const value: string = ctx.state.source.value
  const count = lookup.find(value)
  // @ts-expect-error requiresしていないstateは参照できない
  ctx.state.missing
  await next({ derived: { count } })
  // @ts-expect-error contributionを宣言したLayerではnext引数が必須
  await next()
})
void typed

defineLayer({ name: 'async-factory' }).factory(
  // @ts-expect-error Layer factoryは同期関数でなければならない
  async () => async (_ctx, next) => {
    await next()
  },
)

defineLayer({ name: 'no-contribution' }).factory(() => async (_ctx, next) => {
  const result: Promise<void> = next()
  await result
  // @ts-expect-error contributionがないLayerへstateは渡せない
  await next({ extra: true })
})

const authentication = defineLayer({ name: 'authentication' }).factory<{
  currentUser: { id: string; name: string }
}>(() => async (_ctx, next) => {
  await next({ currentUser: { id: '1', name: 'Loutre' } })
})

const authorization = defineLayer({
  name: 'authorization',
  requires: [authentication],
}).factory<{
  currentUser: { roles: readonly string[] }
}>(() => async (ctx, next) => {
  const id: string = ctx.state.currentUser.id
  void id
  await next({ currentUser: { roles: ['admin'] } })
})

type AuthorizationState = import('@loutrejs/loutre').StateAfter<
  typeof authorization
>
declare const state: AuthorizationState
const id: string = state.currentUser.id
const name: string = state.currentUser.name
const roles: readonly string[] = state.currentUser.roles
void [id, name, roles]
