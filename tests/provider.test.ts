import {
  bootstrapApplication,
  defineApplication,
  defineEnv,
  defineModule,
  inject,
  provide,
  token,
  type ProviderDeclaration,
} from '@loutrejs/loutre'
import { Container } from '@loutrejs/loutre/runtime'
import { z } from 'zod'

describe('Providerの登録とscope', () => {
  it.each(
    (['self', 'override', 'class', 'factory', 'conditional'] as const).flatMap(
      (kind) =>
        (['application', 'transient'] as const).map((scope) => ({
          kind,
          scope,
        })),
    ),
  )(
    '$kind登録の$scopeをModelと実行時解決で維持する',
    async ({ kind, scope }) => {
      class Dependency {}
      class Service {
        constructor(readonly dependency = inject(Dependency)) {}
      }
      class Implementation extends Service {}
      class Env extends defineEnv(z.object({ DRIVER: z.literal('default') })) {}
      const SERVICE = token<Service>('provider.service')
      const declaration: ProviderDeclaration =
        kind === 'self'
          ? provide(Service, { scope })
          : kind === 'override'
            ? provide(Service, { scope }).useClass(Implementation)
            : kind === 'class'
              ? provide(SERVICE, { scope }).useClass(Implementation)
              : kind === 'factory'
                ? provide(SERVICE, { scope }).useFactory({
                    inject: [Dependency],
                    use: (dependency) => new Service(dependency),
                  })
                : provide(SERVICE, { scope }).select(Env.key('DRIVER'), {
                    default: Implementation,
                  })
      const serviceToken =
        kind === 'self' || kind === 'override' ? Service : SERVICE
      class Consumer {
        readonly first = inject(serviceToken)
        readonly second = inject(serviceToken)
      }
      const application = defineApplication({
        modules: [
          defineModule({
            environment: [Env],
            providers: [Dependency, declaration, Consumer],
          }),
        ],
      })
      expect(application.model.diagnostics).toEqual([])
      expect(application.model.nodes).toContainEqual(
        expect.objectContaining({
          token: serviceToken,
          provider: expect.objectContaining({
            kind: kind === 'self' || kind === 'override' ? 'class' : kind,
            scope,
          }),
          dependencies:
            kind === 'conditional' ? [Env, Dependency] : [Dependency],
        }),
      )
      const app = await bootstrapApplication({
        application,
        environment: { DRIVER: 'default' },
      })
      try {
        const { first, second } = app.get(Consumer)
        expect(first).toBeInstanceOf(
          kind === 'self' || kind === 'factory' ? Service : Implementation,
        )
        expect(first === second).toBe(scope === 'application')
        expect(first.dependency).toBe(app.get(Dependency))
        expect(second.dependency).toBe(first.dependency)
        if (scope === 'transient') {
          expect(() => app.get(serviceToken)).toThrow('LUTRE_DI_SCOPED_GET')
        } else {
          expect(app.get(serviceToken)).toBe(first)
        }
      } finally {
        await app.close()
      }
    },
  )

  it('scope省略時はクラス自身のinstanceを共有する', async () => {
    class Service {}
    const application = defineApplication({
      modules: [defineModule({ providers: [provide(Service)] })],
    })
    const app = await bootstrapApplication({ application })
    try {
      expect(app.get(Service)).toBeInstanceOf(Service)
      expect(app.get(Service)).toBe(app.get(Service))
    } finally {
      await app.close()
    }
  })

  it.each(['application', 'transient'] as const)(
    'useValueの%s登録は指定したscopeで同じ値を注入する',
    async (scope) => {
      const VALUE = token<object>('provider.value')
      const value = {}
      class Consumer {
        readonly first = inject(VALUE)
        readonly second = inject(VALUE)
      }
      const application = defineApplication({
        modules: [
          defineModule({
            providers: [provide(VALUE, { scope }).useValue(value), Consumer],
          }),
        ],
      })
      expect(application.model.diagnostics).toEqual([])
      expect(application.model.nodes).toContainEqual(
        expect.objectContaining({
          token: VALUE,
          provider: expect.objectContaining({ kind: 'value', scope }),
        }),
      )
      const app = await bootstrapApplication({ application })
      try {
        expect(app.get(Consumer).first).toBe(value)
        expect(app.get(Consumer).second).toBe(value)
        if (scope === 'transient') {
          expect(() => app.get(VALUE)).toThrow('LUTRE_DI_SCOPED_GET')
        } else {
          expect(app.get(VALUE)).toBe(value)
        }
      } finally {
        await app.close()
      }
    },
  )

  it.each(
    (['value', 'factory'] as const).flatMap((kind) =>
      (['application', 'transient'] as const).map(
        (scope) => [kind, scope] as const,
      ),
    ),
  )('%sが同じ参照を返しても%sのキャッシュ規則に従う', (kind, scope) => {
    const VALUE = token<object>('provider.value')
    const value = {}
    const builder = provide(VALUE, { scope })
    const provider =
      kind === 'value'
        ? builder.useValue(value)
        : builder.useFactory({ use: () => value })
    let resolutions = 0
    const container = new Container([provider], {
      hooks: {
        created: () => {
          resolutions += 1
        },
      },
    })
    expect(container.resolve(VALUE)).toBe(value)
    expect(container.resolve(VALUE)).toBe(value)
    expect(resolutions).toBe(scope === 'application' ? 1 : 2)
  })
})
