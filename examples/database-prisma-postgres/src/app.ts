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
import { PrismaPg } from '@prisma/adapter-pg'
import { z } from 'zod'
import {
  Prisma,
  PrismaClient,
} from './generated/prisma/client.js'

interface AppConfig {
  readonly databaseUrl: string
}

interface PrismaBeginOptions {
  readonly isolationLevel?: Prisma.TransactionIsolationLevel
  readonly maxWait?: number
  readonly timeout?: number
}

interface PrismaDatabaseSpec extends DatabaseAdapterSpec {
  readonly client: PrismaClient
  readonly transactionClient: Prisma.TransactionClient
  readonly beginOptions: PrismaBeginOptions
  readonly savepointOptions: never
  readonly capabilities: {
    readonly transactions: true
    readonly savepoints: true
  }
}

const APP_CONFIG = token<AppConfig>('app.config')

class PrismaDatabase extends DatabaseService<PrismaDatabaseSpec> {
  protected readonly transactionCapabilities = {
    transactions: true,
    savepoints: true,
  } as const

  constructor(readonly config = inject(APP_CONFIG)) {
    super()
  }

  protected async connect(): Promise<PrismaClient> {
    const adapter = new PrismaPg({ connectionString: this.config.databaseUrl })
    const client = new PrismaClient({ adapter })
    try {
      await client.$connect()
      return client
    } catch (error) {
      await client.$disconnect()
      throw error
    }
  }

  protected async disconnect(client: PrismaClient): Promise<void> {
    await client.$disconnect()
  }

  protected async beginTransaction<TResult>(
    client: PrismaClient,
    options: PrismaBeginOptions | undefined,
    execute: (transaction: Prisma.TransactionClient) => Promise<TResult>,
  ): Promise<TResult> {
    return await client.$transaction(
      async (transaction) => await execute(transaction),
      options,
    )
  }

  protected async createSavepoint<TResult>(
    transaction: Prisma.TransactionClient,
    _options: undefined,
    execute: (savepoint: Prisma.TransactionClient) => Promise<TResult>,
  ): Promise<TResult> {
    return await transaction.$transaction(
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
            database: PrismaDatabase,
            options: {
              begin: {
                isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
                maxWait: 5_000,
                timeout: 10_000,
              },
            },
            pipeline: [
              transaction({
                database: PrismaDatabase,
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
}, { name: 'PrismaUsersContract' })

type UsersHttp = ControllerOf<typeof UsersContract, 'http'>

class UserRepository {
  constructor(readonly database = inject(PrismaDatabase)) {}

  create(name: string) {
    return this.database.client.user.create({
      data: {
        id: crypto.randomUUID(),
        name,
        createdBy: 'prisma-example',
      },
    })
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
  name: 'DatabasePrismaPostgresExample',
  providers: [
    provide(APP_CONFIG).useValue({
      databaseUrl: process.env.PRISMA_DATABASE_URL
        ?? 'postgres://loutre:loutre@127.0.0.1:54323/loutre_prisma',
    }),
    PrismaDatabase,
    UserRepository,
  ],
  implementations: [
    implement(UsersContract).for(http).with(UsersController),
  ],
}))

export default createHttpApplication({ modules: [AppModule()] })
