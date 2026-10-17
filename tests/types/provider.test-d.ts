import {
  defineEnv,
  defineModule,
  provide,
  token,
  type ProviderDeclaration,
  type ProviderScopeOptions,
} from '@loutrejs/loutre'
import { z } from 'zod'

abstract class Service {
  abstract readonly name: string
}
class Implementation extends Service {
  readonly name = 'service'
}
class InvalidImplementation {
  readonly name = 123
}
class Env extends defineEnv(z.object({ DRIVER: z.literal('default') })) {}
const SERVICE = token<Service>('service')
declare const options: ProviderScopeOptions

const declarations: readonly ProviderDeclaration[] = [
  provide(Implementation),
  provide(Implementation, { scope: 'transient' }),
  provide(Implementation, options),
  provide(Service, { scope: 'transient' }).useClass(Implementation),
  provide(SERVICE, { scope: 'transient' }).useClass(Implementation),
  provide(SERVICE, options).useClass(Implementation),
  provide(SERVICE).useValue(new Implementation()),
  provide(SERVICE, { scope: 'application' }).useValue(new Implementation()),
  provide(SERVICE, { scope: 'transient' }).useValue(new Implementation()),
  provide(Implementation, { scope: 'transient' }).useValue(
    new Implementation(),
  ),
  provide(SERVICE, options).useValue(new Implementation()),
  provide(SERVICE, { scope: 'transient' }).useFactory({
    use: () => new Implementation(),
  }),
  provide(SERVICE, { scope: 'transient' }).select(Env.key('DRIVER'), {
    default: Implementation,
  }),
]
defineModule({ providers: declarations })

// @ts-expect-error custom tokenには実装の指定が必要
defineModule({ providers: [provide(SERVICE)] })
// @ts-expect-error abstract classには具象実装の指定が必要
defineModule({ providers: [provide(Service, { scope: 'transient' })] })
// @ts-expect-error useClassの実装はtokenの型を満たす必要がある
provide(SERVICE).useClass(InvalidImplementation)
// @ts-expect-error useValueの値はtokenの型を満たす必要がある
provide(SERVICE).useValue(new InvalidImplementation())
// @ts-expect-error factoryの戻り値はtokenの型を満たす必要がある
provide(SERVICE).useFactory({ use: () => new InvalidImplementation() })
// @ts-expect-error selectの実装はtokenの型を満たす必要がある
provide(SERVICE).select(Env.key('DRIVER'), { default: InvalidImplementation })
// @ts-expect-error scopeはuseClassではなくprovideで指定する
provide(SERVICE).useClass(Implementation, { scope: 'transient' })
provide(SERVICE).useFactory({
  // @ts-expect-error scopeはfactory定義ではなくprovideで指定する
  scope: 'transient',
  use: () => new Implementation(),
})
provide(SERVICE).select(
  Env.key('DRIVER'),
  { default: Implementation },
  // @ts-expect-error scopeはselectではなくprovideで指定する
  { scope: 'transient' },
)
