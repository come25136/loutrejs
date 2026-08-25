import { contextKey, inject, layer, token } from '@loutrejs/core'

const A = contextKey('a').of<string>()
const B = contextKey('b').of<number>()
const C = contextKey('c').of<boolean>()

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
  provides: [B],
  factory:
    (lookup = inject(LOOKUP)) =>
    async (ctx, next) => {
      const a: string = ctx.a
      const b = lookup.find(a)
      // @ts-expect-error requiresにないContextはLayerから参照できない
      ctx.c
      await next({ b })
      // @ts-expect-error providesがあるLayerではnext引数が必須
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
  name: 'no-provides',
  factory: () => async (_ctx, next) => {
    await next()
    // @ts-expect-error providesがないLayerへContextは渡せない
    await next({})
  },
})

layer({
  name: 'multiple-provides',
  provides: [B, C],
  factory: () => async (_ctx, next) => {
    await next({ b: 1, c: true })
    // @ts-expect-error 複数providesのpropertyはすべて必須
    await next({ b: 1 })
    // @ts-expect-error provide値はContext Keyの型と一致する必要がある
    await next({ b: 'wrong', c: true })
  },
})
