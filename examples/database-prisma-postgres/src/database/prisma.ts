import {
  inject,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@loutrejs/loutre'
import { PrismaPg } from '@prisma/adapter-pg'
import { AppEnv } from '../config/env.js'
import { Prisma, PrismaClient } from '../generated/prisma/client.js'

export type PrismaTransaction = Prisma.TransactionClient

type PrismaTransactionOptions = Parameters<PrismaClient['$transaction']>[1]

export class PrismaDatabase implements OnModuleInit, OnModuleDestroy {
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
    run: (transaction: PrismaTransaction) => Promise<TResult>,
    options?: PrismaTransactionOptions,
  ): Promise<TResult> {
    return this.client.$transaction(run, options)
  }
}
