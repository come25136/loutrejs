export async function verifyGraphQLTransports(
  url: string,
  http: boolean,
  drain: () => Promise<void>,
  closeCodes: readonly number[] = [1001],
): Promise<void> {
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
