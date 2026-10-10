export async function verifyGraphQLTransports(
  url: string,
  http: boolean,
  drain: () => Promise<void>,
  closeCodes: readonly number[] = [1001],
): Promise<void> {
  await verifyOrderResolution(
    new URL(http ? '/commerce' : '/commerce-ws-only', url).href,
  )
  if (http) {
    const response = await fetch(
      `${url}?query=${encodeURIComponent('{hello}')}`,
      { headers: { accept: 'application/graphql-response+json' } },
    )
    assert(
      JSON.stringify(await response.json()) ===
        JSON.stringify({ data: { hello: 'Hello World' } }),
      'HTTP Query',
    )
    const mutation = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: 'mutation {update(value:"changed")}' }),
    })
    assert(
      JSON.stringify(await mutation.json()) ===
        JSON.stringify({ data: { update: 'changed' } }),
      'HTTP Mutation',
    )
  } else {
    const response = await fetch(url)
    assert(response.status === 404, 'WebSocket only HTTP 404')
  }
  const socket = new WebSocket(url.replace('http:', 'ws:'), [
    'other',
    'graphql-transport-ws',
  ])
  const messages: { type: string; id?: string; payload?: unknown }[] = []
  let wake: (() => void) | undefined
  socket.addEventListener('message', (event) => {
    messages.push(JSON.parse(String(event.data)))
    wake?.()
    wake = undefined
  })
  const closed = new Promise<CloseEvent>((resolve) =>
    socket.addEventListener('close', resolve, { once: true }),
  )
  await withTimeout(
    new Promise<void>((resolve, reject) => {
      socket.addEventListener('open', () => resolve(), { once: true })
      socket.addEventListener(
        'error',
        () => reject(new Error('WebSocket接続に失敗しました。')),
        { once: true },
      )
    }),
    5000,
  )
  assert(socket.protocol === 'graphql-transport-ws', 'subprotocol')
  const send = (value: unknown) => socket.send(JSON.stringify(value))
  const wait = async (predicate: () => boolean) => {
    const deadline = Date.now() + 3000
    while (!predicate()) {
      if (Date.now() >= deadline)
        throw new Error(
          `GraphQL conformance timeout: ${JSON.stringify(messages)}`,
        )
      let timer: ReturnType<typeof setTimeout> | undefined
      await new Promise<void>((resolve) => {
        wake = resolve
        timer = setTimeout(resolve, Math.max(0, deadline - Date.now()))
      })
      clearTimeout(timer)
    }
  }
  try {
    send({ type: 'connection_init', payload: { token: 'conformance' } })
    await wait(() =>
      messages.some((message) => message.type === 'connection_ack'),
    )
    send({
      id: 's',
      type: 'subscribe',
      payload: { query: 'subscription {ticks{sequence}}' },
    })
    await wait(
      () =>
        messages.filter(
          (message) => message.type === 'next' && message.id === 's',
        ).length === 2,
    )
    assert(!JSON.stringify(messages).includes('hidden'), 'selection projection')
    send({ type: 'ping' })
    send({ id: 'q', type: 'subscribe', payload: { query: '{hello}' } })
    send({
      id: 'm',
      type: 'subscribe',
      payload: { query: 'mutation {update(value:"websocket")}' },
    })
    await wait(
      () =>
        messages.some((message) => message.type === 'pong') &&
        ['q', 'm'].every((id) =>
          messages.some(
            (message) => message.id === id && message.type === 'complete',
          ),
        ),
    )
    assert(
      JSON.stringify(
        messages.find(
          (message) => message.id === 'm' && message.type === 'next',
        )?.payload,
      ) === JSON.stringify({ data: { update: 'websocket' } }),
      'WebSocket Mutation',
    )
    send({ id: 's', type: 'complete' })
    send({
      id: 'cleanup',
      type: 'subscribe',
      payload: { query: '{cleanupCount}' },
    })
    await wait(() =>
      messages.some(
        (message) => message.id === 'cleanup' && message.type === 'complete',
      ),
    )
    assert(
      JSON.stringify(
        messages.find(
          (message) => message.id === 'cleanup' && message.type === 'next',
        )?.payload,
      ) === JSON.stringify({ data: { cleanupCount: 1 } }),
      'iterator cleanup',
    )
    send({
      id: 'drain',
      type: 'subscribe',
      payload: { query: 'subscription {ticks{sequence}}' },
    })
    await wait(() =>
      messages.some(
        (message) => message.id === 'drain' && message.type === 'next',
      ),
    )
    await withTimeout(drain(), 15000)
    assert(
      closeCodes.includes((await withTimeout(closed, 5000)).code),
      'graceful shutdown',
    )
  } finally {
    if (socket.readyState === WebSocket.OPEN) socket.close()
  }
}

function assert(condition: boolean, detail: string): asserts condition {
  if (!condition) throw new Error(`GraphQL conformance failed: ${detail}`)
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error('GraphQL conformance timeout')),
          timeoutMs,
        )
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

export async function verifyOrderResolution(url: string): Promise<void> {
  const query = `query($strategy: Strategy!) { orders(strategy:$strategy,pagination:{offset:0,limit:100}) { totalCount pageInfo { hasPreviousPage hasNextPage __typename } edges { id customer { id account { id name __typename } __typename } items { id quantity product { id name category { name __typename } __typename } __typename } __typename } __typename } }`
  let expected: string | undefined
  for (const strategy of ['EAGER', 'LAZY', 'HYBRID']) {
    const before = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: '{productBatchCount}' }),
    }).then((response) => response.json())
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables: { strategy } }),
    })
    const result = await response.json()
    assert(
      !result.errors,
      `Order ${strategy}: ${JSON.stringify(result.errors)}`,
    )
    assert(
      result.data.orders.edges.length === 100 &&
        result.data.orders.edges.reduce(
          (count: number, order: { items: unknown[] }) =>
            count + order.items.length,
          0,
        ) === 200,
      '100注文 / 200明細',
    )
    const serialized = JSON.stringify(result)
    if (expected === undefined) expected = serialized
    else assert(serialized === expected, `Order ${strategy}の結果一致`)
    const after = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query: '{productBatchCount}' }),
    }).then((value) => value.json())
    const calls = after.data.productBatchCount - before.data.productBatchCount
    assert(
      strategy === 'EAGER' ? calls === 0 : calls > 0 && calls < 200,
      `Order ${strategy}のreuse / Batch`,
    )
  }
}
