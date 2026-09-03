import { contextKey, inject, layer, token } from '@loutrejs/loutre'

const A = contextKey<{ a: string }>('a')
const B = contextKey<{ b: number }>('b')
const C = contextKey<{ c: boolean }>('c')

interface Lookup {
  find(value: string): number
}
const LOOKUP = token<Lookup>('lookup')

// @ts-expect-error Layer factoryはdefinitionのfactory propertyへ指定する
layer({ name: 'legacy-layer' }, () => async () => undefined)

// @ts-expect-error Layer definitionにはfactory propertyが必須
layer({ name: 'missing-factory' })

layer({
  name: 'typed-layer',
  requires: [A],
  provide: B,
  factory:
    (lookup = inject(LOOKUP)) =>
    async (ctx, next) => {
      const a: string = ctx.a
      const b = lookup.find(a)
      // @ts-expect-error requiresにないContextはLayerから参照できない
      ctx.c
      await next({ b })
      // @ts-expect-error provideがあるLayerではnext引数が必須
      await next()
    },
})

layer({
  name: 'async-factory',
  // @ts-expect-error Layer factoryは同期関数でなければならない
  factory: async () => async (_ctx: object, next: () => Promise<void>) => {
    await next()
  },
})

layer({
  name: 'no-provide',
  factory: () => async (_ctx, next) => {
    await next()
    // @ts-expect-error provideがないLayerへContextは渡せない
    await next({})
  },
})

layer({
  name: 'multiple-provides-is-invalid',
  // @ts-expect-error Layerは単一のprovideだけを宣言する
  provides: [B, C],
  factory: () => async (_ctx, next) => {
    await next()
  },
})
