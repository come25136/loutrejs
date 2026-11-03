import { task } from '@loutrejs/loutre/tasks'
import {
  bootstrapApplication,
  buildApplicationModel,
  defineApplication,
  defineEnv,
  defineModule,
  inject,
  hook,
  registerSourceLocation,
  token,
  provide,
  type ModuleDefinition,
} from '@loutrejs/loutre'
import { silentLoggingModule } from './helpers/silent-logger.js'
import { z } from 'zod'

describe('静的・動的Module API', () => {
  it('静的定義を直接instanceにし、environment providerとtemplate metadataを保持する', () => {
    class Environment extends defineEnv(z.object({ name: z.string() })) {}
    const module = defineModule({
      name: 'Static',
      environment: [Environment, Environment],
    })
    expect(module.kind).toBe('module-instance')
    expect(module.template.kind).toBe('module-template')
    expect(module.args).toBeUndefined()
    expect(module.definition.environment).toEqual([Environment])
    expect((module.definition as ModuleDefinition).providers).toEqual([
      expect.objectContaining({ provide: Environment, kind: 'environment' }),
    ])
  })

  it('静的Moduleと引数付きfactoryのinstanceを同じimportsへ登録できる', async () => {
    const URL = token<string>('url')
    class Repository {}
    class Service {
      readonly url = inject(URL)
      readonly repository = inject(Repository)
    }
    const Static = defineModule({
      providers: [Repository],
      exports: [Repository],
    })
    const Dynamic = defineModule((options: { url: string }) => ({
      providers: [provide(URL).useValue(options.url)],
      exports: [URL],
    }))
    const Repositories = defineModule({
      imports: [Static],
      exports: [Repository],
    })
    const dynamic = Dynamic({ url: 'postgres://localhost/app' })
    const Root = defineModule({
      imports: [Repositories, dynamic],
      providers: [Service],
    })
    expect(dynamic.args).toEqual({ url: 'postgres://localhost/app' })
    expect(dynamic.template).toBe(Dynamic)
    const definition = defineApplication({
      modules: [Root, silentLoggingModule],
    })
    expect(definition.model.diagnostics).toEqual([])
    const app = await bootstrapApplication({ application: definition })
    try {
      expect(app.get(Service).url).toBe('postgres://localhost/app')
      expect(app.get(Service).repository).toBe(app.get(Repository))
    } finally {
      await app.close()
    }
  })

  it('diamond importとrootで共有する静的参照のProviderを重複させずedgeを維持する', () => {
    class SharedService {}
    const Shared = defineModule({
      name: 'Shared',
      providers: [SharedService],
      exports: [SharedService],
    })
    const Left = defineModule({ name: 'Left', imports: [Shared] })
    const Right = defineModule({ name: 'Right', imports: [Shared] })
    const model = buildApplicationModel({
      modules: [Left, Right, Shared, Left],
    })
    expect(model.diagnostics).toEqual([])
    expect(model.nodes.filter((node) => node.kind === 'module')).toHaveLength(3)
    expect(model.providers).toHaveLength(3)
    expect(model.edges.filter((edge) => edge.kind === 'imports')).toHaveLength(
      2,
    )
  })

  it('引数なしfactoryも明示的に生成したinstanceだけを共有し、Model構築で再生成しない', () => {
    class SharedService {}
    class Consumer {
      readonly service = inject(SharedService)
    }
    let calls = 0
    const Template = defineModule(() => {
      calls += 1
      return {
        name: 'Shared',
        providers: [SharedService],
        exports: [SharedService],
      }
    })
    const shared = Template()
    const Root = defineModule({ imports: [shared], providers: [Consumer] })
    const definition = defineApplication({ modules: [Root, shared] })
    expect(definition.model.diagnostics).toEqual([])
    expect(
      definition.model.nodes.filter((node) => node.kind === 'module'),
    ).toHaveLength(2)
    expect(
      definition.model.edges.filter((edge) => edge.kind === 'imports'),
    ).toHaveLength(1)
    expect(calls).toBe(1)
    const nextDefinition = defineApplication({ modules: [Root, shared] })
    expect(nextDefinition.model.diagnostics).toEqual([])
    expect(calls).toBe(1)
    expect(Template()).not.toBe(shared)
    expect(calls).toBe(2)
  })

  it.each(['root', 'import'] as const)(
    '未生成templateを%sへ登録してもfactoryを呼ばず拒否する',
    (registration) => {
      const factory = vi.fn(() => ({}))
      const Template = defineModule(factory)
      const modules =
        registration === 'root'
          ? [Template]
          : [{ kind: 'module-instance', definition: { imports: [Template] } }]
      expect(() =>
        Reflect.apply(buildApplicationModel, undefined, [{ modules }]),
      ).toThrow('Application modules and imports require Module instances.')
      expect(factory).not.toHaveBeenCalled()
    },
  )

  it.each([true, false])(
    'Provider・Execution・Lifecycleで同じimport visibilityを使う（export=%s）',
    (exported) => {
      class Repository {}
      class Consumer {
        readonly repository = inject(Repository)
      }
      let calls = 0
      const Template = defineModule(() => {
        calls += 1
        return {
          providers: [Repository],
          exports: exported ? [Repository] : [],
        }
      })
      const shared = Template()
      const execution = task<void, void>({
        name: 'probe',
        factory:
          (repository = inject(Repository)) =>
          async () => {
            void repository
          },
      })
      const Root = defineModule({
        imports: [shared],
        providers: [Consumer],
        executions: [execution],
        lifecycle: {
          onModuleInit: hook({ inject: [Repository], run: () => {} }),
        },
      })
      const model = buildApplicationModel({ modules: [Root, shared] })
      expect(calls).toBe(1)
      if (exported) expect(model.diagnostics).toEqual([])
      else
        expect(
          model.diagnostics.filter(
            (item) => item.code === 'LUTRE_MODULE_VISIBILITY',
          ),
        ).toHaveLength(3)
    },
  )

  it('動的Moduleの明示instanceを引数が同じでも別参照として維持する', () => {
    const Dynamic = defineModule((name: string) => ({ name }))
    const first = Dynamic('same')
    const second = Dynamic('same')
    expect(first).not.toBe(second)
    const model = buildApplicationModel({ modules: [first, first, second] })
    expect(model.nodes.filter((node) => node.kind === 'module')).toHaveLength(2)
  })

  it('静的instanceと動的templateへ付けたソース位置をModelに反映する', () => {
    const source = { file: '/app/static.ts', line: 3, column: 1 }
    const Static = registerSourceLocation(
      defineModule({ name: 'Static' }),
      source,
    )
    const Dynamic = registerSourceLocation(
      defineModule((name: string) => ({ name })),
      { ...source, line: 5 },
    )
    const model = buildApplicationModel({
      modules: [Static, Dynamic('Dynamic')],
    })
    expect(
      model.nodes
        .filter((node) => node.kind === 'module')
        .map((node) => node.source),
    ).toEqual([source, { ...source, line: 5 }])
  })
})
