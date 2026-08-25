import {
  contextKey,
  contract,
  defineModule,
  implement,
  inject,
  layer,
  procedure,
  provide,
  token,
} from '@loutrejs/core'
import {
  type ContextOf,
  type ControllerOf,
  createHttpApplication,
  http,
  validate,
} from '@loutrejs/http'
import { z } from 'zod'

interface User {
  readonly id: string
  readonly name: string
  readonly createdBy: string
}

class InMemoryClient {
  constructor(readonly users: Map<string, User>) {}
}

class InMemoryDatabase {
  readonly client = new InMemoryClient(new Map())

  async transaction<TResult>(
    run: (transaction: InMemoryClient) => Promise<TResult>,
  ): Promise<TResult> {
    const transaction = new InMemoryClient(new Map(this.client.users))
    const result = await run(transaction)
    this.client.users.clear()
    for (const [id, user] of transaction.users) {
      this.client.users.set(id, user)
    }
    return result
  }
}

const DATABASE = token<InMemoryDatabase>('database.primary')
const CURRENT_USER = contextKey('currentUser').of<{ readonly id: string }>()
const TRANSACTION = contextKey('transaction').of<InMemoryClient>()

const authentication = layer({
  name: 'authentication.demo',
  role: 'authentication',
  provides: [CURRENT_USER],
  factory: () => async (_ctx, next) => {
    await next({ currentUser: { id: 'demo-user' } })
  },
})

const authorization = layer({
  name: 'authorization.users.create',
  role: 'guard',
  requires: [CURRENT_USER],
  factory: () => async (ctx, next) => {
    if (ctx.currentUser.id.length === 0) {
      throw new Error('利用者を識別できません')
    }
    await next()
  },
})

const transaction = layer({
  name: 'database.transaction',
  provides: [TRANSACTION],
  factory:
    (database = inject(DATABASE)) =>
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
          pipeline: [
            authentication,
            validate.body,
            transaction([authorization, http.controller]),
          ],
        }),
      },
    }),
  },
  { name: 'UsersContract' },
)

type UsersHttp = ControllerOf<typeof UsersContract, 'http'>

class UserRepository {
  create(client: InMemoryClient, name: string, createdBy: string): User {
    const user = { id: crypto.randomUUID(), name, createdBy }
    client.users.set(user.id, user)
    return user
  }
}

class UsersController implements UsersHttp {
  constructor(readonly users = inject(UserRepository)) {}

  create(ctx: ContextOf<UsersHttp, 'create'>) {
    return ctx.response.created({
      body: this.users.create(
        ctx.transaction,
        ctx.body.name,
        ctx.currentUser.id,
      ),
    })
  }
}

const AppModule = defineModule(() => ({
  name: 'DatabaseTransactionsExample',
  providers: [provide(DATABASE).useClass(InMemoryDatabase), UserRepository],
  implementations: [implement(UsersContract).for(http).with(UsersController)],
}))

export default createHttpApplication({ modules: [AppModule()] })
