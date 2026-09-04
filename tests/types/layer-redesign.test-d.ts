import { type, layer, inject, token } from '@loutrejs/loutre'

interface Lookup {
  find(value: string): number
}
const LOOKUP = token<Lookup>('lookup')

const source = layer({
  name: 'source',
  state: type<{
    source: { value: string }
  }>(),
  factory: () => async (_ctx, next) => {
    const result: Promise<void> = next({ source: { value: 'ready' } })
    await result
    // @ts-expect-error contributionを宣言したLayerではnext引数が必須
    await next()
  },
})

const typed = layer({
  name: 'typed-layer',
  requires: [source],
  state: type<{
    derived: { count: number }
  }>(),
  factory:
    (lookup = inject(LOOKUP)) =>
    async (ctx, next) => {
      const value: string = ctx.state.source.value
      const count = lookup.find(value)
      // @ts-expect-error requiresしていないstateは参照できない
      ctx.state.missing
      await next({ derived: { count } })
      // @ts-expect-error contributionを宣言したLayerではnext引数が必須
      await next()
    },
})
const requiredSource: typeof source = typed.requires[0]
void requiredSource

layer({
  name: 'missing-contribution-property',
  state: type<{
    currentUser: { id: string; name: string }
  }>(),
  factory: () => async (_ctx, next) => {
    // @ts-expect-error stateで宣言したpropertyが不足するcontributionは渡せない
    await next({ currentUser: { id: '1' } })
  },
})

layer({
  name: 'extra-contribution-property',
  state: type<{
    currentUser: { id: string }
  }>(),
  factory: () => async (_ctx, next) => {
    // @ts-expect-error stateで宣言していないtop-level propertyは渡せない
    await next({ currentUser: { id: '1' }, extra: true })
  },
})

layer({
  name: 'async-factory',
  factory: // @ts-expect-error Layer factoryは同期関数でなければならない
    async () => async (_ctx, next) => {
      await next()
    },
})

layer({
  name: 'no-contribution',
  factory: () => async (_ctx, next) => {
    const result: Promise<void> = next()
    await result
    // @ts-expect-error contributionがないLayerへstateは渡せない
    await next({ extra: true })
  },
})

const authentication = layer({
  name: 'authentication',
  state: type<{
    currentUser: { id: string; name: string }
  }>(),
  factory: () => async (_ctx, next) => {
    await next({ currentUser: { id: '1', name: 'Loutre' } })
  },
})

const authorization = layer({
  name: 'authorization',
  requires: [authentication],
  state: type<{
    currentUser: { roles: readonly string[] }
  }>(),
  factory: () => async (ctx, next) => {
    const id: string = ctx.state.currentUser.id
    void id
    await next({ currentUser: { roles: ['admin'] } })
  },
})

type AuthorizationState = import('@loutrejs/loutre').StateAfter<
  typeof authorization
>
declare const state: AuthorizationState
const id: string = state.currentUser.id
const name: string = state.currentUser.name
const roles: readonly string[] = state.currentUser.roles
void [id, name, roles]
