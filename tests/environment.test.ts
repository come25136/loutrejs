import {
  bootstrapApplication,
  buildApplicationModel,
  createKernelApplication,
  defineApplication,
  defineEnv,
  defineModule,
  inject,
  loadEnv,
  provide,
  SchemaValidationError,
  token,
} from '@loutrejs/loutre'
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
    tls: env.TLS ? { ca: env.TLS_CA! } : (false as const),
  }))

class AppEnv extends defineEnv(AppEnvSchema) {}

describe('Environment Contract', () => {
  it('Standard Schema validationとtransform後outputをEnvとして公開する', async () => {
    const env = await loadEnv(AppEnv, {
      PORT: '3000',
      TLS: 'true',
      TLS_CA: 'test-ca',
    })

    expect(env).toBeInstanceOf(AppEnv)
    expect(env.port).toBe(3000)
    expect(env.tls).toEqual({ ca: 'test-ca' })
    expect(AppEnv.key('port')).toMatchObject({
      kind: 'runtime-input-key',
      source: 'environment',
      contract: AppEnv,
      key: 'port',
    })
  })

  it('Runtime sourceをvalidationしてからProvider constructionを開始する', async () => {
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
    const application = await bootstrapApplication({
      application: defineApplication({ modules: [AppModule()] }),
      environment: { PORT: '8080', TLS: 'false' },
    })

    expect(application.get(Service).port).toBe(8080)
    expect(application.get(AppEnv).port).toBe(8080)
    await application.close()
  })

  it('cross-field validation failureをSchemaValidationErrorにする', async () => {
    const AppModule = defineModule(() => ({ environment: [AppEnv] }))
    await expect(
      bootstrapApplication({
        application: defineApplication({ modules: [AppModule()] }),
        environment: { PORT: '8080', TLS: 'true' },
      }),
    ).rejects.toBeInstanceOf(SchemaValidationError)
  })

  it('Application ModelはEnvironment access boundaryと後続dependencyを収集する', () => {
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
      providers: [Database, Service, provide(AFTER).useValue('after')],
    }))
    const model = buildApplicationModel({ modules: [AppModule()] })
    const database = model.nodes.find(
      (node) => node.kind === 'provider' && node.token === Database,
    )
    const service = model.nodes.find(
      (node) => node.kind === 'provider' && node.token === Service,
    )
    const environment = model.nodes.find(
      (node) => node.kind === 'provider' && node.token === AppEnv,
    )
    const after = model.nodes.find(
      (node) => node.kind === 'provider' && node.token === AFTER,
    )

    expect(model.diagnostics).toEqual([])
    expect(model.edges).toEqual(
      expect.arrayContaining([
        { from: database?.id, to: environment?.id, kind: 'injects' },
        { from: service?.id, to: database?.id, kind: 'injects' },
        { from: service?.id, to: after?.id, kind: 'injects' },
      ]),
    )
  })

  it('undeclared Env injectionとmanual provider conflictをModel diagnosticにする', async () => {
    class NeedsEnv {
      constructor(readonly env = inject(AppEnv)) {}
    }
    const MissingModule = defineModule(() => ({ providers: [NeedsEnv] }))
    expect(
      buildApplicationModel({ modules: [MissingModule()] }).diagnostics,
    ).toContainEqual(
      expect.objectContaining({ code: 'LUTRE_PROVIDER_DEPENDENCY_MISSING' }),
    )

    const env = await loadEnv(AppEnv, { PORT: '3000', TLS: 'false' })
    const ConflictModule = defineModule(() => ({
      environment: [AppEnv],
      providers: [provide(AppEnv).useValue(env)],
    }))
    expect(
      buildApplicationModel({ modules: [ConflictModule()] }).diagnostics,
    ).toContainEqual(
      expect.objectContaining({ code: 'LUTRE_PROVIDER_DUPLICATE' }),
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
    class DriverEnv extends defineEnv(
      z.object({ DRIVER: z.enum(['plain', 'secure']) }).transform((env) => ({
        driver: env.DRIVER,
      })),
    ) {}
    const AppModule = defineModule(() => ({
      environment: [DriverEnv],
      providers: [
        provide(DRIVER).select(DriverEnv.key('driver'), {
          plain: PlainDriver,
          secure: SecureDriver,
        }),
      ],
    }))
    const application = await bootstrapApplication({
      application: defineApplication({ modules: [AppModule()] }),
      environment: { DRIVER: 'secure' },
    })

    expect(application.get(DRIVER)).toBeInstanceOf(SecureDriver)
    await application.close()
  })

  it('Application Contextはrunning中のapplication scopeだけをgetする', async () => {
    class Service {
      constructor(readonly env = inject(AppEnv)) {}
    }
    class TransientService {}
    const AppModule = defineModule(() => ({
      environment: [AppEnv],
      providers: [
        Service,
        provide(TransientService).useClass(TransientService, {
          scope: 'transient',
        }),
      ],
    }))
    const application = createKernelApplication({
      application: defineApplication({ modules: [AppModule()] }),
      environment: { PORT: '4321', TLS: 'false' },
    })

    expect(() => application.get(AppEnv)).toThrow('LUTRE_APPLICATION_STATE')
    await application.init()
    const env = application.get(AppEnv)
    expect(application.get(Service).env).toBe(env)
    expect(() => application.get(TransientService)).toThrow(
      'LUTRE_DI_SCOPED_GET',
    )
    await application.close()
    expect(() => application.get(AppEnv)).toThrow('LUTRE_APPLICATION_STATE')
  })
})
