import { defineApplication } from '@loutrejs/loutre'
import {
  contextKey,
  contract,
  defineEnv,
  defineModule,
  implementation,
  inject,
  layer,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@loutrejs/loutre'
import { http, validate } from '@loutrejs/loutre/http'
import { PrismaPg } from '@prisma/adapter-pg'
import { z } from 'zod'
import { Prisma, PrismaClient } from './generated/prisma/client.js'
type PrismaTransactionOptions = Parameters<PrismaClient['$transaction']>[1]
const AppEnvSchema = z
  .object({
    PRISMA_DATABASE_URL: z
      .string()
      .default('postgres://loutre:loutre@127.0.0.1:54323/loutre_prisma'),
  })
  .transform((env) => ({
    databaseUrl: new URL(env.PRISMA_DATABASE_URL),
  }))
class AppEnv extends defineEnv(AppEnvSchema) {}
const TRANSACTION = contextKey('transaction').of<Prisma.TransactionClient>()
class PrismaDatabase implements OnModuleInit, OnModuleDestroy {
  readonly client: PrismaClient
  constructor(readonly env = inject(AppEnv)) {
    this.client = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: env.databaseUrl.href,
      }),
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
          maxWait: 5000,
          timeout: 10000,
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
const UsersContract = contract([
  http({
    create: {
      method: 'POST',
      path: '/users',
      request: {
        body: {
          contentType: 'application/json',
          schema: CreateUserBody,
        },
      },
      responses: {
        created: { status: 201, body: UserResponse },
      },
      pipeline: [validate.body, transaction([http.controller])],
    },
  }),
])
class UserRepository {
  create(client: Prisma.TransactionClient, name: string) {
    return client.user.create({
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
  environment: [AppEnv],
  providers: [PrismaDatabase, UserRepository],
  implementations: [UsersController],
}))
export default defineApplication({ modules: [AppModule()] })
