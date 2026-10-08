import { describe, expect, it, vi } from 'vitest'
import {
  buildSchema,
  GraphQLScalarType,
  GraphQLObjectType,
  GraphQLSchema,
} from 'graphql'
import { graphql, type GraphQLContextInput } from '@loutrejs/graphql'
import {
  bootstrapApplication,
  defineApplication,
  defineModule,
  inject,
  token,
  provide,
  type as stateType,
  type RuntimeInstrumentation,
} from '@loutrejs/loutre'
import { bearerAuth, bindHttpServer, http } from '@loutrejs/loutre/http'
import { generateOpenApi } from '@loutrejs/loutre/http/openapi'
import {
  bindWebSocketServer,
  createWebSocketDriverChannel,
  type WebSocketDriverChannel,
} from '@loutrejs/loutre/websocket'

const typeDefs = `
  type Trip { id: ID!, name: String!, secret: String! }
  type Query { hello: String!, trip: Trip!, failure: String }
  type Mutation { update(value: String!): String! }
  type Subscription { trips: Trip! }
`

function source() {
  const queued: unknown[] = []
  let pending: ((result: IteratorResult<unknown>) => void) | undefined
  let done = false
  const cleanup = vi.fn(async () => {
    done = true
    pending?.({ done: true, value: undefined })
    return { done: true as const, value: undefined }
  })
  return {
    cleanup,
    push(value: unknown) {
      if (pending) {
        const next = pending
        pending = undefined
        next({ done: false, value })
      } else queued.push(value)
    },
    iterator: {
      [Symbol.asyncIterator]() {
        return this
      },
      next(): Promise<IteratorResult<unknown>> {
        if (done) return Promise.resolve({ done: true, value: undefined })
        if (queued.length > 0)
          return Promise.resolve({ done: false, value: queued.shift() })
        return new Promise((resolve) => {
          pending = resolve
        })
      },
      return: cleanup,
    },
  }
}

function instrumentation() {
  let active: string | undefined
  let counter = 0
  const traces: {
    id: string
    parent: string | undefined
    kind: string
    attributes: Record<string, unknown>
    complete: ReturnType<typeof vi.fn>
    fail: ReturnType<typeof vi.fn>
  }[] = []
  const begin = (kind: string) => {
    const trace = {
      id: String(++counter),
      parent: active,
      kind,
      attributes: {},
      complete: vi.fn(),
      fail: vi.fn(),
    }
    traces.push(trace)
    return {
      run<T>(invoke: () => T): T {
        const parent = active
        active = trace.id
        try {
          return invoke()
        } finally {
          active = parent
        }
      },
      annotate(attributes: Record<string, unknown>) {
        Object.assign(trace.attributes, attributes)
      },
      complete: trace.complete,
      fail: trace.fail,
    }
  }
  return {
    traces,
    view: {
      beginExecution: (metadata) => begin(metadata.executionKind),
      beginOperation: (metadata) => begin(metadata.kind),
    } satisfies RuntimeInstrumentation,
  }
}

async function fixture(
  options: {
    http?: boolean
    websocket?: boolean
    initTimeout?: number
    middleware?: Parameters<typeof http.raw>[0]['route']['middlewares']
    subscription?: (context: {
      signal: AbortSignal
    }) => AsyncIterable<unknown> | Promise<AsyncIterable<unknown>>
    makeContext?: (
      input: GraphQLContextInput,
    ) => Record<string, unknown> | Promise<Record<string, unknown>>
  } = {},
) {
  const stream = source()
  const contexts: GraphQLContextInput[] = []
  const Service = token<string>('greeting')
  const schema = buildSchema(typeDefs)
  const queryFields = schema.getQueryType()!.getFields()
  queryFields.hello!.resolve = (
    _parent,
    _args,
    context: { greeting: string },
  ) => context.greeting
  queryFields.trip!.resolve = () => ({
    id: '1',
    name: 'Loutre',
    secret: 'hidden',
  })
  queryFields.failure!.resolve = () => {
    throw new Error('resolver failure')
  }
  schema.getMutationType()!.getFields().update!.resolve = (
    _parent,
    args: { value: string },
  ) => args.value
  const trips = schema.getSubscriptionType()!.getFields().trips!
  trips.subscribe = (_parent, _args, context: { signal: AbortSignal }) =>
    options.subscription?.(context) ?? stream.iterator
  trips.resolve = (event: { trips: unknown }) => event.trips
  const endpoint = graphql.endpoint({
    name: 'Api',
    path: '/graphql',
    schema,
    transports: {
      http:
        options.http === false
          ? false
          : options.middleware === undefined
            ? {}
            : { middlewares: options.middleware },
      websocket:
        options.websocket === false
          ? false
          : { connectionInitWaitTimeout: options.initTimeout ?? 1000 },
    },
    factory: (greeting = inject(Service)) => ({
      context(input) {
        contexts.push(input)
        return (
          options.makeContext?.(input) ?? { greeting, signal: input.signal }
        )
      },
    }),
  })
  const Module = defineModule(() => ({
    providers: [provide(Service).useValue('hello DI')],
    executions: [endpoint],
  }))
  const definition = defineApplication({ modules: [Module()] })
  const trace = instrumentation()
  const connections: {
    channel: WebSocketDriverChannel
    sent: Record<string, unknown>[]
  }[] = []
  const driver = bindWebSocketServer({
    runtime: 'test',
    async upgrade(_request, { protocol }) {
      const sent: Record<string, unknown>[] = []
      const channel = createWebSocketDriverChannel({
        protocol: protocol ?? '',
        async send(message) {
          sent.push(JSON.parse(message.data as string))
        },
        async close(code = 1000, reason = '') {
          channel.finish({ code, reason, wasClean: true })
        },
        terminate() {
          channel.finish({ code: 1006, reason: '', wasClean: false })
        },
      })
      connections.push({ channel, sent })
      return { response: new Response(null), connection: channel.connection }
    },
  })
  const app = await bootstrapApplication({
    application: definition,
    capabilities: [bindHttpServer({ runtime: 'test' }), driver],
    instrumentation: trace.view,
  })
  const open = async () => {
    const response = await app.websocket.upgrade(
      new Request('http://test/graphql', {
        headers: {
          upgrade: 'websocket',
          'sec-websocket-protocol': 'other, graphql-transport-ws',
        },
      }),
    )
    expect(response.status).toBe(200)
    const connection = connections.at(-1)!
    return {
      ...connection,
      send(message: Record<string, unknown>) {
        connection.channel.receive({
          type: 'text',
          data: JSON.stringify(message),
        })
      },
      async wait(type: string, id?: string) {
        await vi.waitFor(() =>
          expect(
            connection.sent.some(
              (message) =>
                message.type === type &&
                (id === undefined || message.id === id),
            ),
          ).toBe(true),
        )
      },
    }
  }
  const fetchGraphQL = async (query: string, init: RequestInit = {}) =>
    app.http.fetch(
      new Request('http://test/graphql', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/graphql-response+json',
        },
        body: JSON.stringify({ query }),
        ...init,
      }),
    )
  return {
    app,
    definition,
    contexts,
    stream,
    trace,
    open,
    fetchGraphQL,
    connections,
  }
}

describe('GraphQL HTTP', () => {
  it('Query・Mutation・selection projectionとDIをGraphQL.jsで実行する', async () => {
    const fixtureApi = await fixture()
    try {
      expect(
        await (await fixtureApi.fetchGraphQL('{ hello trip { id } }')).json(),
      ).toEqual({ data: { hello: 'hello DI', trip: { id: '1' } } })
      expect(
        await (
          await fixtureApi.fetchGraphQL('mutation { update(value: "new") }')
        ).json(),
      ).toEqual({ data: { update: 'new' } })
      const response = await fixtureApi.app.http.fetch(
        new Request('http://test/graphql?query=%7Bhello%7D', {
          headers: { accept: 'application/graphql-response+json' },
        }),
      )
      expect(await response.json()).toEqual({ data: { hello: 'hello DI' } })
      expect(fixtureApi.contexts[0]?.transport).toBe('http')
    } finally {
      await fixtureApi.app.close()
    }
  })

  it.each([
    [
      'PUT',
      'application/json',
      'application/graphql-response+json',
      '{hello}',
      405,
    ],
    ['POST', 'text/plain', 'application/graphql-response+json', '{hello}', 415],
    ['POST', 'application/json', 'text/html', '{hello}', 406],
    [
      'POST',
      'application/json',
      'application/graphql-response+json',
      '{unknown}',
      400,
    ],
  ])(
    'method=%s・Content-Type=%s・Accept=%sの応答をlibraryへ委譲する',
    async (method, contentType, accept, query, status) => {
      const api = await fixture()
      try {
        const response = await api.app.http.fetch(
          new Request('http://test/graphql', {
            method: String(method),
            headers: { 'content-type': contentType, accept },
            body: JSON.stringify({ query }),
          }),
        )
        expect(response.status).toBe(status)
        await response.text()
      } finally {
        await api.app.close()
      }
    },
  )

  it('resolverのGraphQL errorsだけではExecutionをfailにしない', async () => {
    const api = await fixture()
    try {
      const response = await api.fetchGraphQL('{failure}')
      expect(response.status).toBe(200)
      expect(await response.json()).toMatchObject({
        data: { failure: null },
        errors: [{ message: 'resolver failure' }],
      })
      expect(
        api.trace.traces.every((trace) => trace.fail.mock.calls.length === 0),
      ).toBe(true)
    } finally {
      await api.app.close()
    }
  })

  it('通常のmiddlewareによる認証・rate limit・stateをraw GraphQL contextへ渡す', async () => {
    const calls: string[] = []
    const auth = http.middleware({
      name: 'auth',
      state: stateType<{ auth: { user: string } }>(),
      factory: () => async (context, next) => {
        calls.push('auth')
        if (context.request.headers.get('authorization') !== 'Bearer valid')
          return new Response(null, { status: 401 })
        await next({ auth: { user: 'alice' } })
      },
    })
    const limit = http.middleware({
      name: 'limit',
      factory: () => async (_context, next) => {
        calls.push('limit')
        await next()
      },
    })
    const api = await fixture({
      middleware: [auth, limit],
      makeContext(input) {
        calls.push('graphql')
        expect(input.transport).toBe('http')
        if (input.transport === 'http')
          expect(input.state).toEqual({ auth: { user: 'alice' } })
        return { greeting: 'authorized' }
      },
    })
    try {
      expect((await api.fetchGraphQL('{hello}')).status).toBe(401)
      expect(calls).toEqual(['auth'])
      calls.length = 0
      const response = await api.fetchGraphQL('{hello}', {
        headers: {
          authorization: 'Bearer valid',
          'content-type': 'application/json',
        },
      })
      expect(await response.json()).toEqual({ data: { hello: 'authorized' } })
      expect(calls).toEqual(['auth', 'limit', 'graphql'])
    } finally {
      await api.app.close()
    }
  })

  it('標準bearerAuth middlewareでGraphQL HTTPを認証しchallengeとstateを保つ', async () => {
    const auth = bearerAuth({
      realm: 'GraphQL',
      factory: () => ({
        authenticate(accessToken: string) {
          return accessToken === 'valid' ? { auth: { user: 'alice' } } : null
        },
        unauthorized() {
          return new Response(null, { status: 401 })
        },
      }),
    })
    const api = await fixture({
      middleware: [auth],
      makeContext(input) {
        if (input.transport === 'http')
          expect(input.state).toEqual({ auth: { user: 'alice' } })
        return { greeting: 'auth' }
      },
    })
    try {
      const rejected = await api.fetchGraphQL('{hello}')
      expect(rejected.status).toBe(401)
      expect(rejected.headers.get('www-authenticate')).toBe(
        'Bearer realm="GraphQL"',
      )
      const response = await api.fetchGraphQL('{hello}', {
        headers: {
          authorization: 'Bearer valid',
          'content-type': 'application/json',
        },
      })
      expect(await response.json()).toEqual({ data: { hello: 'auth' } })
    } finally {
      await api.app.close()
    }
  })

  it('Request.signalをHTTP contextへ渡し、raw endpointをOpenAPIへ展開しない', async () => {
    const api = await fixture()
    const controller = new AbortController()
    try {
      const request = new Request('http://test/graphql?query=%7Bhello%7D', {
        signal: controller.signal,
      })
      const response = await api.app.http.fetch(request)
      await response.text()
      expect(api.contexts[0]?.signal).toBe(request.signal)
      controller.abort()
      expect(api.contexts[0]?.signal.aborted).toBe(true)
      expect(
        generateOpenApi(api.definition.model, {
          info: { title: 'Api', version: '1' },
        }).paths,
      ).toEqual({})
      expect(JSON.stringify(api.definition.model)).not.toContain('_queryType')
    } finally {
      await api.app.close()
    }
  })
})

describe('GraphQL WebSocket', () => {
  it('subprotocolをnegotiationし、init/ack、Query・Mutationを実行する', async () => {
    const api = await fixture()
    try {
      const connection = await api.open()
      expect(connection.channel.connection.protocol).toBe(
        'graphql-transport-ws',
      )
      connection.send({ type: 'connection_init', payload: { token: 'valid' } })
      await connection.wait('connection_ack')
      connection.send({
        id: 'q',
        type: 'subscribe',
        payload: { query: 'query Hello {hello trip {id}}' },
      })
      connection.send({
        id: 'm',
        type: 'subscribe',
        payload: { query: 'mutation {update(value: "ws")}' },
      })
      await connection.wait('complete', 'q')
      await connection.wait('complete', 'm')
      expect(connection.sent).toContainEqual({
        id: 'q',
        type: 'next',
        payload: { data: { hello: 'hello DI', trip: { id: '1' } } },
      })
      expect(connection.sent).toContainEqual({
        id: 'm',
        type: 'next',
        payload: { data: { update: 'ws' } },
      })
      expect(api.contexts).toContainEqual(
        expect.objectContaining({
          transport: 'websocket',
          operationId: 'q',
          connectionParams: { token: 'valid' },
        }),
      )
    } finally {
      await api.app.close()
    }
  })

  it.each(['complete', 'disconnect', 'drain'] as const)(
    '%sでSubscriptionをabortしiterator.returnを一度だけ実行する',
    async (stop) => {
      const api = await fixture()
      const connection = await api.open()
      connection.send({ type: 'connection_init' })
      await connection.wait('connection_ack')
      connection.send({
        id: 's',
        type: 'subscribe',
        payload: { query: 'subscription Updates { trips { id } }' },
      })
      await vi.waitFor(() => expect(api.contexts).toHaveLength(1))
      api.stream.push({
        trips: { id: 'one', name: 'unused', secret: 'hidden' },
      })
      await connection.wait('next', 's')
      api.stream.push({
        trips: { id: 'two', name: 'unused', secret: 'hidden' },
      })
      await vi.waitFor(() =>
        expect(
          connection.sent.filter((message) => message.type === 'next'),
        ).toHaveLength(2),
      )
      connection.send({ type: 'ping', payload: { value: 1 } })
      connection.send({ type: 'pong' })
      connection.send({
        id: 'q',
        type: 'subscribe',
        payload: { query: '{hello}' },
      })
      await connection.wait('pong')
      await connection.wait('complete', 'q')
      if (stop === 'complete') connection.send({ id: 's', type: 'complete' })
      else if (stop === 'disconnect')
        connection.channel.finish({ code: 1006, reason: '', wasClean: false })
      else await api.app.close()
      await vi.waitFor(() =>
        expect(api.stream.cleanup).toHaveBeenCalledTimes(1),
      )
      expect(api.contexts[0]?.signal.aborted).toBe(true)
      await api.app.close()
      expect(api.stream.cleanup).toHaveBeenCalledTimes(1)
      const subscriptionTraces = api.trace.traces.filter(
        (trace) =>
          trace.kind === 'graphql.operation' &&
          trace.attributes['graphql.operation.type'] === 'subscription',
      )
      expect(subscriptionTraces).toHaveLength(1)
      expect(subscriptionTraces[0]?.complete).toHaveBeenCalledTimes(1)
      expect(subscriptionTraces[0]?.fail).not.toHaveBeenCalled()
      const session = api.trace.traces.find(
        (trace) => trace.kind === 'websocket.session',
      )!
      expect(subscriptionTraces[0]?.parent).toBe(session.id)
      expect(subscriptionTraces[0]?.attributes).toMatchObject({
        'graphql.session.id': session.attributes['websocket.session.id'],
        'graphql.operation.id': 's',
        'graphql.operation.name': 'Updates',
        'graphql.transport': 'websocket',
        'websocket.protocol': 'graphql-transport-ws',
      })
    },
  )

  it('複数Subscriptionを同時実行しcompleteを指定operationだけへ伝播する', async () => {
    const sources = [source(), source()]
    let index = 0
    const api = await fixture({
      subscription: () => sources[index++]!.iterator,
    })
    try {
      const connection = await api.open()
      connection.send({ type: 'connection_init' })
      await connection.wait('connection_ack')
      for (const id of ['a', 'b'])
        connection.send({
          id,
          type: 'subscribe',
          payload: { query: 'subscription {trips{id}}' },
        })
      await vi.waitFor(() => expect(api.contexts).toHaveLength(2))
      sources[0]!.push({ trips: { id: 'a' } })
      sources[1]!.push({ trips: { id: 'b' } })
      await connection.wait('next', 'a')
      await connection.wait('next', 'b')
      connection.send({ id: 'a', type: 'complete' })
      await vi.waitFor(() =>
        expect(sources[0]!.cleanup).toHaveBeenCalledTimes(1),
      )
      expect(api.contexts[0]!.signal.aborted).toBe(true)
      expect(api.contexts[1]!.signal.aborted).toBe(false)
      sources[1]!.push({ trips: { id: 'still-active' } })
      await vi.waitFor(() =>
        expect(
          connection.sent.filter(
            (message) => message.id === 'b' && message.type === 'next',
          ),
        ).toHaveLength(2),
      )
    } finally {
      await api.app.close()
    }
    expect(sources[0]!.cleanup).toHaveBeenCalledTimes(1)
    expect(sources[1]!.cleanup).toHaveBeenCalledTimes(1)
  })

  it('subscribe resolver待機中のcompleteで後から得たiteratorも一度だけcleanupする', async () => {
    const delayed = source()
    let started = false
    const api = await fixture({
      subscription(context) {
        started = true
        return new Promise((resolve) =>
          context.signal.addEventListener(
            'abort',
            () => resolve(delayed.iterator),
            { once: true },
          ),
        )
      },
    })
    try {
      const connection = await api.open()
      connection.send({ type: 'connection_init' })
      await connection.wait('connection_ack')
      connection.send({
        id: 'late',
        type: 'subscribe',
        payload: { query: 'subscription {trips{id}}' },
      })
      await vi.waitFor(() => expect(started).toBe(true))
      connection.send({ id: 'late', type: 'complete' })
      await vi.waitFor(() => expect(delayed.cleanup).toHaveBeenCalledTimes(1))
    } finally {
      await api.app.close()
    }
    expect(delayed.cleanup).toHaveBeenCalledTimes(1)
  })

  it('異なるconnectionの同じoperation IDをsession IDで区別する', async () => {
    const api = await fixture()
    try {
      for (let index = 0; index < 2; index += 1) {
        const connection = await api.open()
        connection.send({ type: 'connection_init' })
        await connection.wait('connection_ack')
        connection.send({
          id: '1',
          type: 'subscribe',
          payload: { query: '{hello}' },
        })
        await connection.wait('complete', '1')
      }
      const operations = api.trace.traces.filter(
        (trace) => trace.kind === 'graphql.operation',
      )
      expect(operations).toHaveLength(2)
      expect(
        new Set(
          operations.map((trace) => trace.attributes['graphql.session.id']),
        ).size,
      ).toBe(2)
      expect(
        operations.every(
          (trace) => trace.attributes['graphql.operation.id'] === '1',
        ),
      ).toBe(true)
    } finally {
      await api.app.close()
    }
  })

  it('duplicate operation IDを4409で拒否し全operationをcleanupする', async () => {
    const api = await fixture()
    const connection = await api.open()
    connection.send({ type: 'connection_init' })
    await connection.wait('connection_ack')
    const message = {
      id: '1',
      type: 'subscribe',
      payload: { query: 'subscription {trips{id}}' },
    }
    connection.send(message)
    await vi.waitFor(() => expect(api.contexts).toHaveLength(1))
    connection.send(message)
    expect((await connection.channel.connection.closed).code).toBe(4409)
    await api.app.close()
    expect(api.stream.cleanup).toHaveBeenCalledTimes(1)
  })

  it('connection_init timeoutを4408で終了しprotocol不一致をupgrade前に拒否する', async () => {
    const api = await fixture({ initTimeout: 10 })
    try {
      const rejected = await api.app.websocket.upgrade(
        new Request('http://test/graphql', {
          headers: { 'sec-websocket-protocol': 'graphql-ws' },
        }),
      )
      expect(rejected.status).toBe(400)
      expect(api.connections).toHaveLength(0)
      const connection = await api.open()
      expect((await connection.channel.connection.closed).code).toBe(4408)
    } finally {
      await api.app.close()
    }
  })

  it('context生成中のcompleteでもabortしてresolverを開始しない', async () => {
    const api = await fixture({
      makeContext(input) {
        return new Promise((resolve) => {
          input.signal.addEventListener(
            'abort',
            () => resolve({ greeting: 'late' }),
            { once: true },
          )
        })
      },
    })
    try {
      const connection = await api.open()
      connection.send({ type: 'connection_init' })
      await connection.wait('connection_ack')
      connection.send({
        id: 'pending',
        type: 'subscribe',
        payload: { query: 'subscription {trips{id}}' },
      })
      await vi.waitFor(() => expect(api.contexts).toHaveLength(1))
      connection.send({ id: 'pending', type: 'complete' })
      await vi.waitFor(() =>
        expect(
          api.trace.traces.find((trace) => trace.kind === 'graphql.operation')
            ?.complete,
        ).toHaveBeenCalledTimes(1),
      )
      expect(api.contexts[0]?.signal.aborted).toBe(true)
      expect(api.stream.cleanup).not.toHaveBeenCalled()
      expect(
        connection.sent.filter((message) => message.type === 'next'),
      ).toEqual([])
    } finally {
      await api.app.close()
    }
  })

  it('GraphQL validationとresolver errorsをruntime failureにしない', async () => {
    const api = await fixture()
    try {
      const connection = await api.open()
      connection.send({ type: 'connection_init' })
      await connection.wait('connection_ack')
      connection.send({
        id: 'invalid',
        type: 'subscribe',
        payload: { query: '{unknown}' },
      })
      connection.send({
        id: 'error',
        type: 'subscribe',
        payload: { query: '{failure}' },
      })
      await connection.wait('error', 'invalid')
      await connection.wait('complete', 'error')
      expect(
        api.trace.traces
          .filter((trace) => trace.kind === 'graphql.operation')
          .every(
            (trace) =>
              trace.fail.mock.calls.length === 0 &&
              trace.complete.mock.calls.length === 1,
          ),
      ).toBe(true)
    } finally {
      await api.app.close()
    }
  })
})

describe('GraphQLのresolver契約', () => {
  it('root fieldのresolveが欠落したschemaを拒否する', () => {
    expect(() =>
      graphql.endpoint({
        name: 'Missing',
        path: '/graphql',
        schema: buildSchema('type Query { hello: String }'),
        factory: () => ({ context: () => ({}) }),
      }),
    ).toThrow('Query.hello')
  })

  it.each(['subscribe', 'resolve'] as const)(
    'Subscriptionの%sが欠落したschemaを拒否する',
    (missing) => {
      const schema = buildSchema(
        'type Query { hello: String } type Subscription { events: String }',
      )
      schema.getQueryType()!.getFields().hello!.resolve = () => 'hello'
      const field = schema.getSubscriptionType()!.getFields().events!
      if (missing !== 'subscribe')
        field.subscribe = async function* () {
          yield 'event'
        }
      if (missing !== 'resolve') field.resolve = (event) => event
      expect(() =>
        graphql.endpoint({
          name: 'Missing',
          path: '/graphql',
          schema,
          factory: () => ({ context: () => ({}) }),
        }),
      ).toThrow('Subscription.events')
    },
  )

  it.each(['rootValue', 'context'] as const)(
    'JavaScriptからの旧%s factoryをApplication compileで拒否する',
    (invalid) => {
      const schema = buildSchema('type Query { hello: String }')
      schema.getQueryType()!.getFields().hello!.resolve = () => 'hello'
      const endpoint = graphql.endpoint({
        name: 'Legacy',
        path: '/graphql',
        schema,
        factory: (() =>
          invalid === 'rootValue'
            ? { context: () => ({}), rootValue: {} }
            : {}) as never,
      })
      const Module = defineModule(() => ({ executions: [endpoint] }))
      const application = defineApplication({ modules: [Module()] })
      expect(application.model.diagnostics).toContainEqual(
        expect.objectContaining({ message: expect.stringContaining(invalid) }),
      )
    },
  )

  it('QueryとMutationの同名fieldを別resolverとして実行する', async () => {
    const schema = buildSchema(
      'type Query { value: String! } type Mutation { value: Int! }',
    )
    schema.getQueryType()!.getFields().value!.resolve = () => 'query'
    schema.getMutationType()!.getFields().value!.resolve = () => 42
    const endpoint = graphql.endpoint({
      name: 'Separate',
      path: '/graphql',
      schema,
      factory: () => ({ context: () => ({}) }),
    })
    const Module = defineModule(() => ({ executions: [endpoint] }))
    const app = await bootstrapApplication({
      application: defineApplication({ modules: [Module()] }),
      capabilities: [bindHttpServer({ runtime: 'test' })],
    })
    try {
      for (const [query, value] of [
        ['query { value }', 'query'],
        ['mutation { value }', 42],
      ]) {
        const response = await app.http.fetch(
          new Request('http://test/graphql', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ query }),
          }),
        )
        expect(await response.json()).toEqual({ data: { value } })
      }
    } finally {
      await app.close()
    }
  })
})

it.each([false, true])(
  'custom scalarの出力coercion登録=%sをendpoint定義で検証する',
  (registered) => {
    const scalar = new GraphQLScalarType({
      name: 'Timestamp',
      ...(registered ? { serialize: (value: unknown) => String(value) } : {}),
    })
    const schema = new GraphQLSchema({
      query: new GraphQLObjectType({
        name: 'Query',
        fields: { timestamp: { type: scalar, resolve: () => '2026-10-08' } },
      }),
    })
    const create = () =>
      graphql.endpoint({
        name: 'Scalar',
        path: '/graphql',
        schema,
        factory: () => ({ context: () => ({}) }),
      })
    if (registered) expect(create).not.toThrow()
    else expect(create).toThrow('Timestamp')
  },
)
