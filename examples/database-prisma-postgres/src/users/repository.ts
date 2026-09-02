import type { PrismaTransaction } from '../database/prisma.js'

export class UserRepository {
  create(client: PrismaTransaction, name: string) {
    return client.user.create({
      data: {
        id: crypto.randomUUID(),
        name,
        createdBy: 'prisma-example',
      },
    })
  }
}
