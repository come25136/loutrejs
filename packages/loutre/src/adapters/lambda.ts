import {
  binding,
  type ApplicationDefinition,
  type BootstrapArguments,
  type HasHttp,
  type InvocationBindingOptions,
} from '../application/index.js'
import type { HttpProtocolExecution } from '../http/index.js'

type IsAny<TValue> = 0 extends 1 & TValue ? true : false

type HttpApplication<TDefinition extends ApplicationDefinition> =
  IsAny<TDefinition> extends true
    ? TDefinition
    : HasHttp<TDefinition> extends true
      ? TDefinition
      : never

export type LambdaBindBaseOptions<TDefinition extends ApplicationDefinition> = {
  readonly application: HttpApplication<TDefinition>
  readonly environment?: unknown
} & BootstrapArguments<TDefinition>

export type LambdaBindOptions<TDefinition extends ApplicationDefinition> =
  LambdaBindBaseOptions<TDefinition> & {
    readonly response?: 'buffered'
  }

export type LambdaStreamingBindOptions<
  TDefinition extends ApplicationDefinition,
> = LambdaBindBaseOptions<TDefinition> & {
  readonly response: 'streaming'
}

export interface LambdaHttpEvent {
  readonly rawPath?: string
  readonly rawQueryString?: string
  readonly requestContext?: {
    readonly http?: { readonly method?: string }
  }
  readonly headers?: Readonly<Record<string, string | undefined>>
  readonly body?: string | null
  readonly isBase64Encoded?: boolean
}

export interface LambdaHttpResult {
  readonly statusCode: number
  readonly headers: Readonly<Record<string, string>>
  readonly cookies?: readonly string[]
  readonly body: string
  readonly isBase64Encoded: boolean
}

export type LambdaHttpHandler = (
  event: LambdaHttpEvent,
) => Promise<LambdaHttpResult>

export interface LambdaResponseStream {
  write(chunk: Uint8Array): boolean
  end(): void
  once?(event: 'drain', listener: () => void): unknown
  setMetadata?(metadata: {
    readonly statusCode: number
    readonly headers: Readonly<Record<string, string>>
    readonly cookies?: readonly string[]
  }): void
}

export type LambdaStreamingHttpHandler = (
  event: LambdaHttpEvent,
  output: LambdaResponseStream,
  context?: unknown,
) => Promise<void>

export const lambdaRuntime = {
  runtime: 'lambda',
  capabilities: new Set([
    'http.server',
    'http.response.streaming',
    'stream.readable',
    'stream.writable',
    'env.runtime',
    'crypto.random',
  ]),
  bind,
} as const

function bind<const TDefinition extends ApplicationDefinition>(
  options: LambdaStreamingBindOptions<TDefinition>,
): LambdaStreamingHttpHandler
function bind<const TDefinition extends ApplicationDefinition>(
  options: LambdaBindOptions<TDefinition>,
): LambdaHttpHandler
function bind<const TDefinition extends ApplicationDefinition>(
  options:
    | LambdaBindOptions<TDefinition>
    | LambdaStreamingBindOptions<TDefinition>,
): LambdaHttpHandler | LambdaStreamingHttpHandler {
  const invocation = binding.invocation({
    application: options.application,
    environment: 'environment' in options ? options.environment : process.env,
    ...('arguments' in options ? { arguments: options.arguments } : {}),
  } as unknown as InvocationBindingOptions<TDefinition>)
  const http =
    'http' in invocation
      ? (invocation.http as HttpProtocolExecution)
      : undefined
  if (!http) {
    void invocation.application.close()
    throw new Error(
      'LUTRE_RUNTIME_HTTP_REQUIRED: lambdaRuntime.bind() requires an HTTP-capable Application.',
    )
  }

  if (options.response === 'streaming') {
    const handler = createLambdaStreamingHttpDriver(http)
    const aws = awsLambdaGlobal()
    return aws?.streamifyResponse ? aws.streamifyResponse(handler) : handler
  }
  return createLambdaHttpDriver(http)
}

function createLambdaHttpDriver(
  application: HttpProtocolExecution,
): LambdaHttpHandler {
  let initialization: Promise<void> | undefined
  return async (event) => {
    initialization ??= application.initialize()
    await initialization
    const response = await application.handle(toRequest(event))
    const metadata = responseMetadata(response)
    return {
      statusCode: response.status,
      ...metadata,
      body: Buffer.from(await response.arrayBuffer()).toString('base64'),
      isBase64Encoded: true,
    }
  }
}

function createLambdaStreamingHttpDriver(
  application: HttpProtocolExecution,
): LambdaStreamingHttpHandler {
  let initialization: Promise<void> | undefined
  return async (event, output) => {
    initialization ??= application.initialize()
    await initialization
    const response = await application.handle(toRequest(event))
    const metadata = responseMetadata(response)
    const aws = awsLambdaGlobal()
    const outputMetadata = {
      statusCode: response.status,
      headers: metadata.headers,
      ...(metadata.cookies === undefined
        ? {}
        : { multiValueHeaders: { 'Set-Cookie': metadata.cookies } }),
    }
    const stream = aws?.HttpResponseStream?.from
      ? aws.HttpResponseStream.from(output, outputMetadata)
      : output
    if (stream === output) {
      output.setMetadata?.({
        statusCode: response.status,
        ...metadata,
      })
    }
    const reader = response.body?.getReader()
    if (reader) {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        if (!stream.write(chunk.value) && stream.once) {
          await new Promise<void>((resolve) => {
            stream.once?.('drain', resolve)
          })
        }
      }
    }
    stream.end()
  }
}

function responseMetadata(
  response: Response,
): Pick<LambdaHttpResult, 'headers' | 'cookies'> {
  const headers = Object.fromEntries(
    [...response.headers.entries()].filter(([name]) => name !== 'set-cookie'),
  )
  const cookies = response.headers.getSetCookie()
  return {
    headers,
    ...(cookies.length === 0 ? {} : { cookies }),
  }
}

function toRequest(event: LambdaHttpEvent): Request {
  const path = event.rawPath ?? '/'
  const query = event.rawQueryString ? `?${event.rawQueryString}` : ''
  const body = event.body
    ? event.isBase64Encoded
      ? Buffer.from(event.body, 'base64')
      : event.body
    : undefined
  return new Request(`https://lambda.local${path}${query}`, {
    method: event.requestContext?.http?.method ?? 'GET',
    headers: Object.fromEntries(
      Object.entries(event.headers ?? {}).filter(
        (entry): entry is [string, string] => entry[1] !== undefined,
      ),
    ),
    ...(body === undefined ? {} : { body }),
  })
}

interface AwsLambdaGlobal {
  streamifyResponse(
    handler: LambdaStreamingHttpHandler,
  ): LambdaStreamingHttpHandler
  readonly HttpResponseStream?: {
    from(
      output: LambdaResponseStream,
      metadata: {
        readonly statusCode: number
        readonly headers: Readonly<Record<string, string>>
        readonly multiValueHeaders?: Readonly<Record<string, readonly string[]>>
      },
    ): LambdaResponseStream
  }
}

function awsLambdaGlobal(): AwsLambdaGlobal | undefined {
  return (globalThis as typeof globalThis & { awslambda?: unknown })
    .awslambda as AwsLambdaGlobal | undefined
}
