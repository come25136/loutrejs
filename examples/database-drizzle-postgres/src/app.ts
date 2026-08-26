import { defineApplication } from '@loutrejs/application'
import {
  contextKey,
  contract,
  defineEnv,
  defineModule,
  implementation,
  inject,
  layer,
  procedure,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@loutrejs/core'
import {
  http,
  validate,
} from '@loutrejs/http'
import { sql } from 'drizzle-orm'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { z } from 'zod'
import * as schema from './schema.js'

type DrizzleDatabaseClient = NodePgDatabase<typeof schema>
type DrizzleTransaction = Parameters<
  Parameters<DrizzleDatabaseClient['transaction']>[0]
>[0]
type DrizzleTransactionOptions = Parameters<
  DrizzleDatabaseClient['transaction']
>[1]

const AppEnvSchema = z
  .object({
    DRIZZLE_DATABASE_URL: z
      .string()
      .default(
        'postgres://loutre:loutre@127.0.0.1:54322/loutre_drizzle',
      ),
  })
  .transform((env) => ({
    databaseUrl: new URL(env.DRIZZLE_DATABASE_URL),
  }))

class AppEnv extends defineEnv(AppEnvSchema) {}

const TRANSACTION = contextKey('transaction').of<DrizzleTransaction>()

class DrizzleDatabase implements OnModuleInit, OnModuleDestroy {
  readonly pool: Pool
  readonly client: DrizzleDatabaseClient

  constructor(
    readonly env = inject(AppEnv),
  ) {
    this.pool = new Pool({
      connectionString: env.databaseUrl.href,
    })
    this.client = drizzle({ client: this.pool, schema })
  }

  async onModuleInit(): Promise<void> {
    await this.client.execute(sql`select 1`)
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end()
  }

  transaction<TResult>(
    run: (transaction: DrizzleTransaction) => Promise<TResult>,
    options?: DrizzleTransactionOptions,
  ): Promise<TResult> {
    return this.client.transaction(run, options)
  }
}

const transaction = layer({
  name: 'database.transaction',
  provides: [TRANSACTION],
  factory:
    (database = inject(DrizzleDatabase)) =>
    async (_ctx, next) => {
      await database.transaction(
        async (client) => {
          await next({ transaction: client })
        },
        {
          isolationLevel: 'read committed',
          accessMode: 'read write',
          deferrable: false,
        },
      )
    },
})

const CreateUserBody = z.object({ name: z.string().min(1) })
const UserResponse = z.object({
  id: z.string(),
  name: z.string(),
  createdBy: z.string(),
})

const UsersContract = contract(
  {
    create: procedure({
      protocols: {
        http: http({
          method: 'POST',
          path: '/users',
          request: { body: CreateUserBody },
          responses: {
            created: { status: 201, body: UserResponse },
          },
          pipeline: [validate.body, transaction([http.controller])],
        }),
      },
    }),
  },
  { name: 'DrizzleUsersContract' },
)

class UserRepository {
  async create(transaction: DrizzleTransaction, name: string) {
    const [user] = await transaction
      .insert(schema.users)
      .values({
        id: crypto.randomUUID(),
        name,
        createdBy: 'drizzle-example',
      })
      .returning()
    if (!user) throw new Error('作成した利用者を取得できません')
    return user
  }
}

const UsersController = implementation({
  name: 'UsersController',
  contract: UsersContract,
  protocol: http,
  factory: (users = inject(UserRepository)) => ({
    async create(ctx) {
      return ctx.response.created({
        body: await users.create(ctx.transaction, ctx.body.name),
      })
    },
  }),
})

const AppModule = defineModule(() => ({
  name: 'DatabaseDrizzlePostgresExample',
  environment: [AppEnv],
  providers: [
    DrizzleDatabase,
    UserRepository,
  ],
  implementations: [UsersController],
}))

export default defineApplication({ modules: [AppModule()] })
