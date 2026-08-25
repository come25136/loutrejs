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
import { z } from 'zod'

interface User {
  readonly id: string
  readonly name: string
  readonly createdBy: string
}

class InMemoryClient {
  constructor(readonly users: Map<string, User>) {}
}

interface InMemoryDatabaseSpec extends DatabaseAdapterSpec {
  readonly client: InMemoryClient
  readonly transactionClient: InMemoryClient
  readonly beginOptions: { readonly label?: string }
  readonly savepointOptions: { readonly label?: string }
  readonly capabilities: {
    readonly transactions: true
    readonly savepoints: true
  }
}

class InMemoryDatabase extends DatabaseService<InMemoryDatabaseSpec> {
  protected readonly transactionCapabilities = {
    transactions: true,
    savepoints: true,
  } as const

  protected connect(): InMemoryClient {
    return new InMemoryClient(new Map())
  }

  protected disconnect(): void {}

  protected async beginTransaction<TResult>(
    client: InMemoryClient,
    _options: InMemoryDatabaseSpec['beginOptions'] | undefined,
    execute: (transaction: InMemoryClient) => Promise<TResult>,
  ): Promise<TResult> {
    const transaction = new InMemoryClient(new Map(client.users))
    const result = await execute(transaction)
    replaceUsers(client.users, transaction.users)
    return result
  }

  protected async createSavepoint<TResult>(
    transaction: InMemoryClient,
    _options: InMemoryDatabaseSpec['savepointOptions'] | undefined,
    execute: (savepoint: InMemoryClient) => Promise<TResult>,
  ): Promise<TResult> {
    const savepoint = new InMemoryClient(new Map(transaction.users))
    const result = await execute(savepoint)
    replaceUsers(transaction.users, savepoint.users)
    return result
  }
}

function replaceUsers(target: Map<string, User>, source: ReadonlyMap<string, User>): void {
  target.clear()
  for (const [id, user] of source) target.set(id, user)
}

const DATABASE = token<InMemoryDatabase>('database.primary')
const CURRENT_USER = contextKey('currentUser').of<{ readonly id: string }>()

const authentication = layer({
  name: 'authentication.demo',
  role: 'authentication',
  provides: [CURRENT_USER],
  inbound: () => ({ currentUser: { id: 'demo-user' } }),
})

const authorization = layer({
  name: 'authorization.users.create',
  role: 'guard',
  requires: [CURRENT_USER],
  inbound: (context) => {
    if (context.currentUser.id.length === 0) throw new Error('利用者を識別できません')
  },
})

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
        responses: {
          created: { status: 201, body: UserResponse },
        },
        pipeline: [
          authentication,
          transaction({
            database: DATABASE,
            options: { begin: { label: 'users.create' } },
            pipeline: [
              authorization,
              transaction({
                database: DATABASE,
                propagation: 'savepoint',
                options: { savepoint: { label: 'validate-user' } },
                pipeline: [validate.body],
              }),
              http.controller,
            ],
          }),
        ],
      }),
    },
  }),
}, { name: 'UsersContract' })

type UsersHttp = ControllerOf<typeof UsersContract, 'http'>

class UserRepository {
  constructor(readonly database = inject(DATABASE)) {}

  create(name: string, createdBy: string): User {
    const id = crypto.randomUUID()
    const user = { id, name, createdBy }
    this.database.client.users.set(id, user)
    return user
  }
}

class UsersController implements UsersHttp {
  constructor(readonly users = inject(UserRepository)) {}

  create(context: ContextOf<UsersHttp, 'create'>) {
    return context.response.created({
      body: this.users.create(context.body.name, context.currentUser.id),
    })
  }
}

const AppModule = defineModule(() => ({
  name: 'DatabaseTransactionsExample',
  providers: [
    provide(DATABASE).useClass(InMemoryDatabase),
    UserRepository,
  ],
  implementations: [
    implement(UsersContract).for(http).with(UsersController),
  ],
}))

export default createHttpApplication({ modules: [AppModule()] })
