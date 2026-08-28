import {
  defineEnv,
  defineModule,
  hook,
  provide,
  token,
  type EnvKey,
  type BeforeApplicationShutdown,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
  type OnModuleDestroy,
  type OnModuleInit,
  type Token,
} from '@loutrejs/loutre'
import { createApplicationRuntime } from '@loutrejs/loutre/runtime'
import { z } from 'zod'

const AppEnvSchema = z.object({
  STORAGE_DRIVER: z.enum(['memory', 's3']),
  PRIMARY_DATABASE_URL: z.string(),
  ANALYTICS_DATABASE_URL: z.string(),
})

export class AppEnv extends defineEnv(AppEnvSchema) {}

export class Database
  implements
    OnModuleInit,
    OnApplicationBootstrap,
    OnModuleDestroy,
    BeforeApplicationShutdown,
    OnApplicationShutdown
{
  constructor(
    readonly name: string,
    readonly url: string,
    readonly events: string[],
  ) {}

  onModuleInit(): void {
    this.events.push(`${this.name}.connect:${this.url}`)
  }

  verifySchema(): void {
    this.events.push(`${this.name}.verify`)
  }

  onApplicationBootstrap(): void {
    this.events.push(`${this.name}.bootstrap`)
  }

  onModuleDestroy(): void {
    this.events.push(`${this.name}.close`)
  }

  beforeApplicationShutdown(signal?: string): void {
    this.events.push(`${this.name}.beforeShutdown:${signal ?? ''}`)
  }

  onApplicationShutdown(signal?: string): void {
    this.events.push(`${this.name}.shutdown:${signal ?? ''}`)
  }
}

export interface Storage {
  readonly driver: 'memory' | 's3'
}

export class MemoryStorage implements Storage {
  readonly driver = 'memory' as const
}

export class S3Storage implements Storage {
  readonly driver = 's3' as const
}

export const PRIMARY_DB = token<Database>('database.primary')
export const ANALYTICS_DB = token<Database>('database.analytics')
export const STORAGE = token<Storage>('storage')
export const LIFECYCLE_EVENTS = token<string[]>('lifecycle.events')

interface DatabaseModuleArgs {
  readonly provide: Token<Database>
  readonly name: string
  readonly url: EnvKey<string>
}

export const DatabaseModule = defineModule<DatabaseModuleArgs>((args) => ({
  description: `${args.name} database`,
  providers: [
    provide(args.provide).useFactory({
      inject: [AppEnv, LIFECYCLE_EVENTS],
      use: (env: AppEnv, events: string[]) =>
        new Database(
          args.name,
          env[args.url.key as keyof AppEnv] as string,
          events,
        ),
    }),
  ],
  exports: [args.provide],
  lifecycle: {
    onModuleInit: hook({
      inject: [args.provide],
      run: (database) => database.verifySchema(),
    }),
  },
}))

export async function createDatabaseFixture(
  storageDriver: 'memory' | 's3' = 'memory',
) {
  const events: string[] = []
  const environmentSource = {
    STORAGE_DRIVER: storageDriver,
    PRIMARY_DATABASE_URL: 'primary://fixture',
    ANALYTICS_DATABASE_URL: 'analytics://fixture',
  }
  const AppModule = defineModule(() => ({
    description: 'Database fixture application',
    imports: [
      DatabaseModule({
        provide: PRIMARY_DB,
        name: 'primary',
        url: AppEnv.key('PRIMARY_DATABASE_URL'),
      }),
      DatabaseModule({
        provide: ANALYTICS_DB,
        name: 'analytics',
        url: AppEnv.key('ANALYTICS_DATABASE_URL'),
      }),
    ],
    environment: [AppEnv],
    providers: [
      provide(LIFECYCLE_EVENTS).useValue(events),
      provide(STORAGE).select(AppEnv.key('STORAGE_DRIVER'), {
        memory: MemoryStorage,
        s3: S3Storage,
      }),
    ],
  }))
  const runtime = createApplicationRuntime([AppModule()], {
    environmentSource,
  })
  await runtime.initialize()
  const env = runtime.container.resolve(AppEnv)
  return { runtime, events, env }
}
