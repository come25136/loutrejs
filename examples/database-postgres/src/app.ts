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
import { Pool, type PoolClient } from 'pg'
import { z } from 'zod'

interface AppConfig {
  readonly databaseUrl: string
}

interface PostgresDatabaseSpec extends DatabaseAdapterSpec {
  readonly client: Pool
  readonly transactionClient: PoolClient
  readonly beginOptions: never
  readonly savepointOptions: never
  readonly capabilities: {
    readonly transactions: true
    readonly savepoints: true
  }
}

const APP_CONFIG = token<AppConfig>('app.config')

class PostgresDatabase extends DatabaseService<PostgresDatabaseSpec> {
  protected readonly transactionCapabilities = {
    transactions: true,
    savepoints: true,
  } as const
  #savepointSequence = 0

  constructor(readonly config = inject(APP_CONFIG)) {
    super()
  }

  protected async connect(): Promise<Pool> {
    const pool = new Pool({ connectionString: this.config.databaseUrl })
    try {
      await pool.query('SELECT 1')
      return pool
    } catch (error) {
      await pool.end()
      throw error
    }
  }

  protected async disconnect(client: Pool): Promise<void> {
    await client.end()
  }

  protected async beginTransaction<TResult>(
    client: Pool,
    _options: undefined,
    execute: (transaction: PoolClient) => Promise<TResult>,
  ): Promise<TResult> {
    const transaction = await client.connect()
    try {
      await transaction.query('BEGIN')
      const result = await execute(transaction)
      await transaction.query('COMMIT')
      return result
    } catch (error) {
      await transaction.query('ROLLBACK')
      throw error
    } finally {
      transaction.release()
    }
  }

  protected async createSavepoint<TResult>(
    transaction: PoolClient,
    _options: undefined,
    execute: (savepoint: PoolClient) => Promise<TResult>,
  ): Promise<TResult> {
    const name = `loutre_${++this.#savepointSequence}`
    await transaction.query(`SAVEPOINT ${name}`)
    try {
      const result = await execute(transaction)
      await transaction.query(`RELEASE SAVEPOINT ${name}`)
      return result
    } catch (error) {
      await transaction.query(`ROLLBACK TO SAVEPOINT ${name}`)
      throw error
    }
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
            database: PostgresDatabase,
            pipeline: [
              transaction({
                database: PostgresDatabase,
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
}, { name: 'PostgresUsersContract' })

type UsersHttp = ControllerOf<typeof UsersContract, 'http'>

class UserRepository {
  constructor(readonly database = inject(PostgresDatabase)) {}

  async create(name: string) {
    const result = await this.database.client.query<{
      readonly id: string
      readonly name: string
      readonly created_by: string
    }>(
      `INSERT INTO users (id, name, created_by)
       VALUES ($1, $2, $3)
       RETURNING id, name, created_by`,
      [crypto.randomUUID(), name, 'postgres-example'],
    )
    const user = result.rows[0]
    if (!user) throw new Error('作成した利用者を取得できません')
    return {
      id: user.id,
      name: user.name,
      createdBy: user.created_by,
    }
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
  name: 'DatabasePostgresExample',
  providers: [
    provide(APP_CONFIG).useValue({
      databaseUrl: process.env.DATABASE_URL
        ?? 'postgres://loutre:loutre@127.0.0.1:54321/loutre',
    }),
    PostgresDatabase,
    UserRepository,
  ],
  implementations: [
    implement(UsersContract).for(http).with(UsersController),
  ],
}))

export default createHttpApplication({ modules: [AppModule()] })
