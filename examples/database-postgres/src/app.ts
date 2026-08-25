import {
  contextKey,
  contract,
  defineModule,
  implementation,
  inject,
  layer,
  procedure,
  provide,
  token,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@loutrejs/core'
import {
  createHttpApplication,
  http,
  validate,
} from '@loutrejs/http'
import { Pool, type PoolClient } from 'pg'
import { z } from 'zod'

const DATABASE_URL = token<string>('database.url')
const TRANSACTION = contextKey('transaction').of<PoolClient>()

class PostgresDatabase implements OnModuleInit, OnModuleDestroy {
  readonly pool: Pool

  constructor(url = inject(DATABASE_URL)) {
    this.pool = new Pool({ connectionString: url })
  }

  async onModuleInit(): Promise<void> {
    await this.pool.query('SELECT 1')
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end()
  }

  async transaction<TResult>(
    run: (transaction: PoolClient) => Promise<TResult>,
  ): Promise<TResult> {
    const transaction = await this.pool.connect()
    try {
      await transaction.query('BEGIN')
      const result = await run(transaction)
      await transaction.query('COMMIT')
      return result
    } catch (error) {
      await transaction.query('ROLLBACK')
      throw error
    } finally {
      transaction.release()
    }
  }
}

const transaction = layer({
  name: 'database.transaction',
  provides: [TRANSACTION],
  factory:
    (database = inject(PostgresDatabase)) =>
    async (_ctx, next) => {
      await database.transaction(async (client) => {
        await next({ transaction: client })
      })
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
  { name: 'PostgresUsersContract' },
)

class UserRepository {
  async create(transaction: PoolClient, name: string) {
    const result = await transaction.query<{
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
  name: 'DatabasePostgresExample',
  providers: [
    provide(DATABASE_URL).useValue(
      process.env.DATABASE_URL ??
        'postgres://loutre:loutre@127.0.0.1:54321/loutre',
    ),
    PostgresDatabase,
    UserRepository,
  ],
  implementations: [UsersController],
}))

export default createHttpApplication({ modules: [AppModule()] })
