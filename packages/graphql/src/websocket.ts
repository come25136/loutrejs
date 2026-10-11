import type { ExecutionOperationLease } from '@loutrejs/loutre'
import type {
  WebSocketHandlerContext,
  WebSocketMessageCodec,
} from '@loutrejs/loutre/websocket'
import { makeServer, parseMessage, MessageType } from 'graphql-ws'
import {
  parse,
  validate,
  getOperationAST,
  GraphQLError,
  type ExecutionArgs,
  type ExecutionResult,
  type GraphQLFormattedError,
} from 'graphql'
import type { GraphQLRuntime, GraphQLWebSocketContextInput } from './types.js'
import { formatGraphQLError } from './errors.js'
import type { BoundManifest } from './manifest-internal.js'
import {
  executeManifest,
  subscribeManifest,
  incrementalErrors,
} from './execution.js'

interface Operation {
  readonly input: GraphQLWebSocketContextInput
  readonly controller: AbortController
  readonly lease: ExecutionOperationLease
  cleanup?: () => Promise<unknown>
  formattingFailure?: { readonly error: unknown }
  finished: boolean
}

type TextSchema = {
  '~standard': {
    version: 1
    vendor: string
    validate(
      value: unknown,
    ): { value: string } | { issues: readonly { message: string }[] }
    types: { input: string; output: string }
  }
}
type SessionContext = WebSocketHandlerContext<{
  path: string
  messages: WebSocketMessageCodec<TextSchema, TextSchema>
}>

export async function serveGraphQLWebSocket(
  context: SessionContext,
  bound: BoundManifest,
  runtime: GraphQLRuntime,
  options: { readonly connectionInitWaitTimeout?: number },
): Promise<void> {
  const operations = new Map<string, Operation>()
  const schema = bound.schema
  const executionOperations = new WeakMap<ExecutionArgs, Operation>()
  const tasks = new Set<Promise<void>>()
  const operationTasks = new Map<string, Promise<void>>()
  let receive!: (data: string) => Promise<void>
  const finish = (id: string) => {
    const operation = operations.get(id)
    if (!operation || operation.finished) return
    operation.finished = true
    operation.controller.abort()
    operation.lease.complete()
    operations.delete(id)
  }
  const abortAll = () => {
    for (const operation of operations.values())
      operation.controller.abort(context.signal.reason)
  }
  const run = <T>(operation: Operation | undefined, invoke: () => T): T =>
    operation?.lease.run ? operation.lease.run(invoke) : invoke()
  const format = (
    operation: Operation,
    error: GraphQLError,
  ): GraphQLFormattedError => {
    if (operation.formattingFailure) throw operation.formattingFailure.error
    try {
      return formatGraphQLError(runtime, error, operation.input)
    } catch (failure) {
      operation.formattingFailure = { error: failure }
      operation.lease.fail?.(failure)
      throw failure
    }
  }
  const server = makeServer({
    schema,
    ...(options.connectionInitWaitTimeout === undefined
      ? {}
      : { connectionInitWaitTimeout: options.connectionInitWaitTimeout }),
    async onSubscribe(connection, id, payload) {
      const controller = new AbortController()
      const lease = context.execution.beginOperation({
        kind: 'graphql.operation',
        name: payload.operationName || id,
      })
      const input: GraphQLWebSocketContextInput = {
        transport: 'websocket',
        request: context.request,
        connectionParams: connection.connectionParams,
        operationId: id,
        signal: controller.signal,
      }
      const operation: Operation = { controller, lease, input, finished: false }
      operations.set(id, operation)
      lease.annotate?.({
        'graphql.session.id': context.session.id,
        'graphql.operation.id': id,
        'graphql.operation.name': payload.operationName ?? '',
        'graphql.operation.type': 'unknown',
        'graphql.transport': 'websocket',
        'websocket.session.id': context.session.id,
        'websocket.protocol': context.protocol,
      })
      if (context.signal.aborted) controller.abort(context.signal.reason)
      let document
      try {
        document = parse(payload.query)
      } catch (error) {
        if (error instanceof GraphQLError) return [error]
        throw error
      }
      const ast = getOperationAST(document, payload.operationName)
      if (ast)
        lease.annotate?.({
          'graphql.operation.name': ast.name?.value ?? '',
          'graphql.operation.type': ast.operation,
        })
      const errors = [
        ...validate(schema, document),
        ...incrementalErrors(document),
      ]
      if (errors.length > 0) return errors
      if (!ast) return [new GraphQLError('Unable to identify operation')]
      const contextValue = await run(operation, () => runtime.context(input))
      const args: ExecutionArgs = {
        schema,
        document,
        contextValue,
        ...(payload.operationName == null
          ? {}
          : { operationName: payload.operationName }),
        ...(payload.variables == null
          ? {}
          : { variableValues: payload.variables }),
      }
      executionOperations.set(args, operation)
      return args
    },
    execute(args) {
      const operation = executionOperations.get(args)
      if (operation?.controller.signal.aborted) return { data: null }
      return run(operation, () =>
        executeManifest(bound, args, {
          signal: operation!.controller.signal,
          annotate: (attributes) => operation?.lease.annotate?.(attributes),
        }),
      )
    },
    async subscribe(args) {
      const operation = executionOperations.get(args)!
      if (operation.controller.signal.aborted) return { data: null }
      const result = await run(operation, () =>
        subscribeManifest(bound, args, {
          signal: operation.controller.signal,
          annotate: (attributes) => operation.lease.annotate?.(attributes),
        }),
      )
      if (!isAsyncIterable(result)) return result
      const iterator = cancellableIterator(
        result[Symbol.asyncIterator](),
        operation,
      )
      operation.cleanup = () => iterator.return!()
      if (operation.controller.signal.aborted) await iterator.return!()
      return iterator
    },
    onNext(_connection, id, _payload, _args, result) {
      const operation = operations.get(id)!
      if (!runtime.formatError || !result.errors) return
      return {
        ...(result.data === undefined ? {} : { data: result.data }),
        ...(result.extensions === undefined
          ? {}
          : { extensions: result.extensions }),
        errors: result.errors.map((error) => format(operation, error)),
      }
    },
    async onError(_connection, id, _payload, errors) {
      const operation = operations.get(id)!
      try {
        if (runtime.formatError)
          return errors.map((error) => format(operation, error))
      } finally {
        await operation.cleanup?.()
        finish(id)
      }
    },
    async onComplete(_connection, id) {
      await operations.get(id)?.cleanup?.()
      finish(id)
    },
  })
  const dispose = server.opened(
    {
      protocol: context.protocol,
      send: (data) => context.send(data),
      close: (code, reason) => {
        void context.close(code, reason).catch(() => undefined)
      },
      onMessage: (callback) => {
        receive = callback
      },
    },
    undefined,
  )
  context.signal.addEventListener('abort', abortAll, { once: true })
  const dispatch = (data: string) => {
    let id: string | undefined
    let predecessor: Promise<void> | undefined
    try {
      const message = parseMessage(data)
      if (message.type === MessageType.Complete)
        operations.get(message.id)?.controller.abort()
      if (message.type === MessageType.Subscribe) {
        id = message.id
        const operation = operations.get(id)
        if (!operation || operation.controller.signal.aborted)
          predecessor = operationTasks.get(id)
      }
    } catch {
      // protocol validationとclose codeの選択はgraphql-wsへ委譲する。
    }
    const invoke = () => receive(data)
    const task = (predecessor ? predecessor.then(invoke) : invoke())
      .catch(async (error: unknown) => {
        if (!context.signal.aborted) {
          for (const operation of operations.values())
            if (!operation.formattingFailure) operation.lease.fail?.(error)
          await context.close(1011, 'Internal server error')
        }
      })
      .finally(() => {
        tasks.delete(task)
        if (id !== undefined && operationTasks.get(id) === task)
          operationTasks.delete(id)
      })
    tasks.add(task)
    if (id !== undefined) operationTasks.set(id, task)
  }
  try {
    for await (const message of context.input.messages) {
      if (!message.isValid) {
        await context.close(4400, 'Invalid message received')
        break
      }
      dispatch(message.value)
    }
  } finally {
    abortAll()
    const info = await context.closed
    try {
      await dispose(info.code, info.reason)
      await Promise.all(
        [...operations.values()].map((operation) => operation.cleanup?.()),
      )
      await Promise.all(tasks)
    } finally {
      context.signal.removeEventListener('abort', abortAll)
      for (const id of operations.keys()) finish(id)
    }
  }
}

function isAsyncIterable(
  value: ExecutionResult | AsyncIterable<ExecutionResult>,
): value is AsyncIterable<ExecutionResult> {
  return Symbol.asyncIterator in value
}

function cancellableIterator(
  source: AsyncIterator<ExecutionResult>,
  operation: Operation,
): AsyncIterableIterator<ExecutionResult> {
  let ended = false
  let returning: Promise<IteratorResult<ExecutionResult>> | undefined
  const done = { done: true as const, value: undefined }
  const signal = operation.controller.signal
  let resolveAborted!: (result: IteratorResult<ExecutionResult>) => void
  const aborted = new Promise<IteratorResult<ExecutionResult>>((resolve) => {
    resolveAborted = resolve
  })
  const abort = () => {
    ended = true
    resolveAborted(done)
  }
  signal.addEventListener('abort', abort, { once: true })
  if (signal.aborted) abort()
  return {
    [Symbol.asyncIterator]() {
      return this
    },
    async next() {
      if (ended) return done
      try {
        const result = await Promise.race([
          runSource(() => source.next()),
          aborted,
        ])
        if (result.done) {
          ended = true
          signal.removeEventListener('abort', abort)
        }
        return ended ? done : result
      } catch (error) {
        operation.lease.fail?.(error)
        throw error
      }
    },
    return() {
      if (returning) return returning
      ended = true
      operation.controller.abort()
      signal.removeEventListener('abort', abort)
      returning = Promise.resolve()
        .then(() => runSource(() => source.return?.()))
        .then(() => done)
      return returning
    },
  }
  function runSource<T>(invoke: () => T): T {
    return operation.lease.run ? operation.lease.run(invoke) : invoke()
  }
}
