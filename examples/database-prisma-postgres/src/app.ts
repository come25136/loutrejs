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
import { PrismaPg } from '@prisma/adapter-pg'
import { z } from 'zod'
import { Prisma, PrismaClient } from './generated/prisma/client.js'

type PrismaTransactionOptions = Parameters<PrismaClient['$transaction']>[1]

const DATABASE_URL = token<string>('database.url')
const TRANSACTION = contextKey('transaction').of<Prisma.TransactionClient>()

class PrismaDatabase implements OnModuleInit, OnModuleDestroy {
  readonly client: PrismaClient

  constructor(url = inject(DATABASE_URL)) {
    this.client = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url }),
    })
  }

  async onModuleInit(): Promise<void> {
    await this.client.$connect()
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect()
  }

  transaction<TResult>(
    run: (transaction: Prisma.TransactionClient) => Promise<TResult>,
    options?: PrismaTransactionOptions,
  ): Promise<TResult> {
    return this.client.$transaction(run, options)
  }
}

const transaction = layer({
  name: 'database.transaction',
  provides: [TRANSACTION],
  factory:
    (database = inject(PrismaDatabase)) =>
    async (_ctx, next) => {
      await database.transaction(
        async (client) => {
          await next({ transaction: client })
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 5_000,
          timeout: 10_000,
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
  { name: 'PrismaUsersContract' },
)

class UserRepository {
  create(transaction: Prisma.TransactionClient, name: string) {
    return transaction.user.create({
      data: {
        id: crypto.randomUUID(),
        name,
        createdBy: 'prisma-example',
      },
    })
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
  name: 'DatabasePrismaPostgresExample',
  providers: [
    provide(DATABASE_URL).useValue(
      process.env.PRISMA_DATABASE_URL ??
        'postgres://loutre:loutre@127.0.0.1:54323/loutre_prisma',
    ),
    PrismaDatabase,
    UserRepository,
  ],
  implementations: [UsersController],
}))

export default createHttpApplication({ modules: [AppModule()] })
