import {
  bootstrapApplication,
  buildApplicationModel,
  createKernelApplication,
  application,
  env,
  module,
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
  .superRefine((values, ctx) => {
    if (values.TLS && !values.TLS_CA) {
      ctx.addIssue({
        code: 'custom',
        path: ['TLS_CA'],
        message: 'TLS=true requires TLS_CA',
      })
    }
  })
  .transform((values) => ({
    port: values.PORT,
    tls: values.TLS ? { ca: values.TLS_CA! } : (false as const),
  }))

class AppEnv extends env(AppEnvSchema) {}

describe('Environment Contract', () => {
  it('Standard Schema validationとtransform後outputをEnvとして公開する', async () => {
    const appEnv = await loadEnv(AppEnv, {
      PORT: '3000',
      TLS: 'true',
      TLS_CA: 'test-ca',
    })

    expect(appEnv).toBeInstanceOf(AppEnv)
    expect(appEnv.port).toBe(3000)
    expect(appEnv.tls).toEqual({ ca: 'test-ca' })
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
      constructor(readonly appEnv = inject(AppEnv)) {
        this.port = appEnv.port
      }
    }
    const AppModule = module(() => ({
      environment: [AppEnv],
      providers: [Service],
    }))
    const app = await bootstrapApplication({
      application: application({ modules: [AppModule()] }),
      environment: { PORT: '8080', TLS: 'false' },
    })

    expect(app.get(Service).port).toBe(8080)
    expect(app.get(AppEnv).port).toBe(8080)
    await app.close()
  })

  it('cross-field validation failureをSchemaValidationErrorにする', async () => {
    const AppModule = module(() => ({ environment: [AppEnv] }))
    await expect(
      bootstrapApplication({
        application: application({ modules: [AppModule()] }),
        environment: { PORT: '8080', TLS: 'true' },
      }),
    ).rejects.toBeInstanceOf(SchemaValidationError)
  })

  it('Application ModelはEnvironment access boundaryと後続dependencyを収集する', () => {
    const AFTER = token<string>('after')
    class Database {
      readonly port: number
      constructor(appEnv = inject(AppEnv)) {
        this.port = appEnv.port
      }
    }
    class Service {
      constructor(
        readonly database = inject(Database),
        readonly after = inject(AFTER),
      ) {}
    }
    const AppModule = module(() => ({
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
      constructor(readonly appEnv = inject(AppEnv)) {}
    }
    const MissingModule = module(() => ({ providers: [NeedsEnv] }))
    expect(
      buildApplicationModel({ modules: [MissingModule()] }).diagnostics,
    ).toContainEqual(
      expect.objectContaining({ code: 'LUTRE_PROVIDER_DEPENDENCY_MISSING' }),
    )

    const appEnv = await loadEnv(AppEnv, { PORT: '3000', TLS: 'false' })
    const ConflictModule = module(() => ({
      environment: [AppEnv],
      providers: [provide(AppEnv).useValue(appEnv)],
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
    class DriverEnv extends env(
      z.object({ DRIVER: z.enum(['plain', 'secure']) }).transform((values) => ({
        driver: values.DRIVER,
      })),
    ) {}
    const AppModule = module(() => ({
      environment: [DriverEnv],
      providers: [
        provide(DRIVER).select(DriverEnv.key('driver'), {
          plain: PlainDriver,
          secure: SecureDriver,
        }),
      ],
    }))
    const app = await bootstrapApplication({
      application: application({ modules: [AppModule()] }),
      environment: { DRIVER: 'secure' },
    })

    expect(app.get(DRIVER)).toBeInstanceOf(SecureDriver)
    await app.close()
  })

  it('Application Contextはrunning中のapplication scopeだけをgetする', async () => {
    class Service {
      constructor(readonly appEnv = inject(AppEnv)) {}
    }
    class TransientService {}
    const AppModule = module(() => ({
      environment: [AppEnv],
      providers: [
        Service,
        provide(TransientService).useClass(TransientService, {
          scope: 'transient',
        }),
      ],
    }))
    const app = createKernelApplication({
      application: application({ modules: [AppModule()] }),
      environment: { PORT: '4321', TLS: 'false' },
    })

    expect(() => app.get(AppEnv)).toThrow('LUTRE_APPLICATION_STATE')
    await app.init()
    const appEnv = app.get(AppEnv)
    expect(app.get(Service).appEnv).toBe(appEnv)
    expect(() => app.get(TransientService)).toThrow('LUTRE_DI_SCOPED_GET')
    await app.close()
    expect(() => app.get(AppEnv)).toThrow('LUTRE_APPLICATION_STATE')
  })
})
