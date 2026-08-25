import {
  contract,
  defineModule,
  implement,
  inject,
  procedure,
  provide,
  token,
} from '@loutrejs/core'
import {
  DatabaseService,
  transaction,
  type DatabaseAdapterSpec,
} from '@loutrejs/database'
import {
  type ContextOf,
  type ControllerOf,
  createHttpApplication,
  http,
  validate,
} from '@loutrejs/http'
import { sql } from 'drizzle-orm'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { z } from 'zod'
import * as schema from './schema.js'

interface AppConfig {
  readonly databaseUrl: string
}

type DrizzleClient = NodePgDatabase<typeof schema>
type DrizzleTransaction = Parameters<
  Parameters<DrizzleClient['transaction']>[0]
>[0]
type DrizzleBeginOptions = NonNullable<
  Parameters<DrizzleClient['transaction']>[1]
>

interface DrizzleDatabaseSpec extends DatabaseAdapterSpec {
  readonly client: DrizzleClient
  readonly transactionClient: DrizzleTransaction
  readonly beginOptions: DrizzleBeginOptions
  readonly savepointOptions: never
  readonly capabilities: {
    readonly transactions: true
    readonly savepoints: true
  }
}

const APP_CONFIG = token<AppConfig>('app.config')

class DrizzleDatabase extends DatabaseService<DrizzleDatabaseSpec> {
  protected readonly transactionCapabilities = {
    transactions: true,
    savepoints: true,
  } as const
  #pool: Pool | undefined

  constructor(readonly config = inject(APP_CONFIG)) {
    super()
  }

  protected async connect(): Promise<DrizzleClient> {
    const pool = new Pool({ connectionString: this.config.databaseUrl })
    const client = drizzle({ client: pool, schema })
    try {
      await client.execute(sql`select 1`)
      this.#pool = pool
      return client
    } catch (error) {
      await pool.end()
      throw error
    }
  }

  protected async disconnect(): Promise<void> {
    const pool = this.#pool
    this.#pool = undefined
    await pool?.end()
  }

  protected async beginTransaction<TResult>(
    client: DrizzleClient,
    options: DrizzleBeginOptions | undefined,
    execute: (transaction: DrizzleTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    return await client.transaction(
      async (transaction) => await execute(transaction),
      options,
    )
  }

  protected async createSavepoint<TResult>(
    transaction: DrizzleTransaction,
    _options: undefined,
    execute: (savepoint: DrizzleTransaction) => Promise<TResult>,
  ): Promise<TResult> {
    return await transaction.transaction(
      async (savepoint) => await execute(savepoint),
    )
  }
}

const CreateUserBody = z.object({ name: z.string().min(1) })
const UserResponse = z.object({
  id: z.string(),
  name: z.string(),
  createdBy: z.string(),
})

const UsersContract = contract({
  create: procedure({
    protocols: {
      http: http({
        method: 'POST',
        path: '/users',
        request: { body: CreateUserBody },
        responses: { created: { status: 201, body: UserResponse } },
        pipeline: [
          transaction({
            database: DrizzleDatabase,
            options: {
              begin: {
                isolationLevel: 'read committed',
                accessMode: 'read write',
                deferrable: false,
              },
            },
            pipeline: [
              transaction({
                database: DrizzleDatabase,
                propagation: 'savepoint',
                pipeline: [validate.body],
              }),
              http.controller,
            ],
          }),
        ],
      }),
    },
  }),
}, { name: 'DrizzleUsersContract' })

type UsersHttp = ControllerOf<typeof UsersContract, 'http'>

class UserRepository {
  constructor(readonly database = inject(DrizzleDatabase)) {}

  async create(name: string) {
    const [user] = await this.database.client
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

class UsersController implements UsersHttp {
  constructor(readonly users = inject(UserRepository)) {}

  async create(context: ContextOf<UsersHttp, 'create'>) {
    return context.response.created({
      body: await this.users.create(context.body.name),
    })
  }
}

const AppModule = defineModule(() => ({
  name: 'DatabaseDrizzlePostgresExample',
  providers: [
    provide(APP_CONFIG).useValue({
      databaseUrl: process.env.DRIZZLE_DATABASE_URL
        ?? 'postgres://loutre:loutre@127.0.0.1:54322/loutre_drizzle',
    }),
    DrizzleDatabase,
    UserRepository,
  ],
  implementations: [
    implement(UsersContract).for(http).with(UsersController),
  ],
}))

export default createHttpApplication({ modules: [AppModule()] })
