import {
  defineEnv,
  defineModule,
  inject,
  loadEnv,
  provide,
  token,
} from '@loutrejs/core'
import { compileApplication } from '@loutrejs/graph'
import {
  createApplicationRuntime,
  EnvironmentBindingError,
} from '@loutrejs/runtime'
import { z } from 'zod'

const AppEnvSchema = z
  .object({
    PORT: z.coerce.number().int().positive(),
    TLS: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    TLS_CA: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.TLS && !env.TLS_CA) {
      ctx.addIssue({
        code: 'custom',
        path: ['TLS_CA'],
        message: 'TLS=true requires TLS_CA',
      })
    }
  })
  .transform((env) => ({
    port: env.PORT,
    tls: env.TLS
      ? { ca: env.TLS_CA! }
      : false as const,
  }))

class AppEnv extends defineEnv(AppEnvSchema) {}

describe('Environment Contract', () => {
  it('Standard Schemaのparse / cross-field validation / transform後outputをEnvとして公開する', async () => {
    const env = await loadEnv(AppEnv, {
      PORT: '3000',
      TLS: 'true',
      TLS_CA: 'test-ca',
    })

    expect(env).toBeInstanceOf(AppEnv)
    expect(env.port).toBe(3000)
    expect(env.tls).toEqual({ ca: 'test-ca' })
    expect(AppEnv.key('port')).toMatchObject({
      kind: 'env-key',
      env: AppEnv,
      key: 'port',
    })
  })

  it('Runtime sourceをvalidationしてからProvider constructionとLifecycleを開始する', async () => {
    class Service {
      readonly port: number

      constructor(readonly env = inject(AppEnv)) {
        this.port = env.port
      }
    }

    const AppModule = defineModule(() => ({
      environment: [AppEnv],
      providers: [Service],
    }))

    const runtime = createApplicationRuntime([AppModule()], {
      environmentSource: {
        PORT: '8080',
        TLS: 'false',
      },
    })

    await runtime.initialize()

    expect(runtime.container.resolve(Service).port).toBe(8080)
    expect(
      runtime.graph.providers.filter(
        (provider) => provider.kind === 'environment',
      ),
    ).toHaveLength(1)

    await runtime.shutdown()
  })

  it('cross-field validation failureをsecret-safeなEnvironmentBindingErrorにする', async () => {
    const AppModule = defineModule(() => ({
      environment: [AppEnv],
    }))
    const runtime = createApplicationRuntime([AppModule()], {
      environmentSource: {
        PORT: '8080',
        TLS: 'true',
      },
    })

    await expect(runtime.initialize()).rejects.toBeInstanceOf(
      EnvironmentBindingError,
    )
  })

  it('Graph ProbeはEnvironment accessを正常なboundaryとして扱い後続dependencyも収集する', () => {
    const AFTER = token<string>('after')

    class Database {
      readonly port: number

      constructor(env = inject(AppEnv)) {
        this.port = env.port
      }
    }

    class Service {
      constructor(
        readonly database = inject(Database),
        readonly after = inject(AFTER),
      ) {}
    }

    const AppModule = defineModule(() => ({
      environment: [AppEnv],
      providers: [
        Database,
        Service,
        provide(AFTER).useValue('after'),
      ],
    }))

    const { graph, diagnostics } = compileApplication({ modules: [AppModule()] })

    expect(diagnostics).toEqual([])

    const database = graph.nodes.find(({ label }) => label === 'Database')
    const service = graph.nodes.find(({ label }) => label === 'Service')
    const environment = graph.nodes.find(({ label }) => label === 'AppEnv')
    const after = graph.nodes.find(({ label }) => label === 'after')

    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: database?.id,
          to: environment?.id,
          kind: 'inject',
          source: 'probed',
        }),
        expect.objectContaining({
          from: service?.id,
          to: database?.id,
          kind: 'inject',
          source: 'probed',
        }),
        expect.objectContaining({
          from: service?.id,
          to: after?.id,
          kind: 'inject',
          source: 'probed',
        }),
      ]),
    )
  })

  it('undeclared Env injectionとmanual provider conflictをdiagnosticする', async () => {
    class NeedsEnv {
      constructor(readonly env = inject(AppEnv)) {}
    }

    const MissingModule = defineModule(() => ({
      providers: [NeedsEnv],
    }))
    expect(compileApplication({ modules: [MissingModule()] }).diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'LUTRE_ENV_002',
        }),
      ]),
    )

    const env = await loadEnv(AppEnv, {
      PORT: '3000',
      TLS: 'false',
    })
    const ConflictModule = defineModule(() => ({
      environment: [AppEnv],
      providers: [
        provide(AppEnv).useValue(env),
      ],
    }))
    expect(compileApplication({ modules: [ConflictModule()] }).diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'LUTRE_ENV_001',
        }),
      ]),
    )
  })

  it('conditional Providerはtransform後のEnv keyで選択する', async () => {
    const DRIVER = token<{ readonly driver: string }>('driver')

    class PlainDriver {
      readonly driver = 'plain'
    }

    class SecureDriver {
      readonly driver = 'secure'
    }

    const DriverEnvSchema = z
      .object({
        DRIVER: z.enum(['plain', 'secure']),
      })
      .transform((env) => ({
        driver: env.DRIVER,
      }))

    class DriverEnv extends defineEnv(DriverEnvSchema) {}

    const AppModule = defineModule(() => ({
      environment: [DriverEnv],
      providers: [
        provide(DRIVER).select(DriverEnv.key('driver'), {
          plain: PlainDriver,
          secure: SecureDriver,
        }),
      ],
    }))

    const runtime = createApplicationRuntime([AppModule()], {
      environmentSource: {
        DRIVER: 'secure',
      },
    })

    await runtime.initialize()
    expect(runtime.container.resolve(DRIVER)).toBeInstanceOf(SecureDriver)
    await runtime.shutdown()
  })
})
