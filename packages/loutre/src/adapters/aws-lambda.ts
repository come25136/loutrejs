import {
  createKernelApplication,
  type ApplicationDefinition,
  type BootstrapArguments,
  type RequireApplicationExtension,
} from '../application/index.js'
import type { RuntimeCapabilityBinding } from '../core/index.js'
import { bindApplicationCapability } from '../application/kernel-internal.js'
import { httpExecutionExtension } from '../http/index.js'
import { assertRuntimeEngine } from '../runtime/engine.js'

type HttpApplication<TDefinition extends ApplicationDefinition> =
  RequireApplicationExtension<TDefinition, typeof httpExecutionExtension>

export type AwsLambdaBindBaseOptions<
  TDefinition extends ApplicationDefinition,
> = {
  readonly application: HttpApplication<TDefinition>
  readonly environment?: unknown
  readonly capabilities?: readonly RuntimeCapabilityBinding[]
} & BootstrapArguments<TDefinition>

export type AwsLambdaBindOptions<TDefinition extends ApplicationDefinition> =
  AwsLambdaBindBaseOptions<TDefinition> & {
    readonly response?: 'buffered'
  }

export type AwsLambdaStreamingBindOptions<
  TDefinition extends ApplicationDefinition,
> = AwsLambdaBindBaseOptions<TDefinition> & {
  readonly response: 'streaming'
}

export interface AwsLambdaHttpEvent {
  readonly rawPath?: string
  readonly rawQueryString?: string
  readonly requestContext?: {
    readonly http?: { readonly method?: string }
  }
  readonly headers?: Readonly<Record<string, string | undefined>>
  readonly body?: string | null
  readonly isBase64Encoded?: boolean
}

export interface AwsLambdaHttpResult {
  readonly statusCode: number
  readonly headers: Readonly<Record<string, string>>
  readonly cookies?: readonly string[]
  readonly body: string
  readonly isBase64Encoded: boolean
}

export type AwsLambdaHttpHandler = (
  event: AwsLambdaHttpEvent,
) => Promise<AwsLambdaHttpResult>

export interface AwsLambdaResponseStream {
  write(chunk: Uint8Array): boolean
  end(): void
  once?(event: 'drain', listener: () => void): unknown
  setMetadata?(metadata: {
    readonly statusCode: number
    readonly headers: Readonly<Record<string, string>>
    readonly cookies?: readonly string[]
  }): void
}

export type AwsLambdaStreamingHttpHandler = (
  event: AwsLambdaHttpEvent,
  output: AwsLambdaResponseStream,
  context?: unknown,
) => Promise<void>

export const awsLambdaRuntime = {
  runtime: 'aws-lambda',
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
  options: AwsLambdaStreamingBindOptions<TDefinition>,
): AwsLambdaStreamingHttpHandler
function bind<const TDefinition extends ApplicationDefinition>(
  options: AwsLambdaBindOptions<TDefinition>,
): AwsLambdaHttpHandler
function bind<const TDefinition extends ApplicationDefinition>(
  options:
    | AwsLambdaBindOptions<TDefinition>
    | AwsLambdaStreamingBindOptions<TDefinition>,
): AwsLambdaHttpHandler | AwsLambdaStreamingHttpHandler {
  assertRuntimeEngine('aws-lambda')
  if (
    options.application.model.extensions.get(httpExecutionExtension) ===
    undefined
  ) {
    throw new Error(
      'LUTRE_RUNTIME_HTTP_REQUIRED: awsLambdaRuntime.bind() requires the HTTP Execution Extension.',
    )
  }

  const application = createKernelApplication<TDefinition>({
    ...options,
    application: options.application,
    capabilities: [
      bindApplicationCapability(options.application.model, 'http.server', {
        runtime: 'aws-lambda',
      }),
      ...(options.capabilities ?? []),
    ],
    environment: 'environment' in options ? options.environment : process.env,
  })
  const http: AwsLambdaHttpRequestHandler = {
    initialize: async () => {
      await application.init()
    },
    fetch: (request) =>
      (
        application as unknown as {
          readonly http: AwsLambdaHttpRequestHandler
        }
      ).http.fetch(request),
  }

  if (options.response === 'streaming') {
    const handler = createAwsLambdaStreamingHttpDriver(http)
    const aws = awsLambdaGlobal()
    return aws?.streamifyResponse ? aws.streamifyResponse(handler) : handler
  }
  return createAwsLambdaHttpDriver(http)
}

interface AwsLambdaHttpRequestHandler {
  initialize?(): Promise<void>
  fetch(request: Request): Promise<Response>
}

function createAwsLambdaHttpDriver(
  application: AwsLambdaHttpRequestHandler,
): AwsLambdaHttpHandler {
  let initialization: Promise<void> | undefined
  return async (event) => {
    initialization ??= application.initialize?.() ?? Promise.resolve()
    await initialization
    const response = await application.fetch(toRequest(event))
    const metadata = responseMetadata(response)
    return {
      statusCode: response.status,
      ...metadata,
      body: Buffer.from(await response.arrayBuffer()).toString('base64'),
      isBase64Encoded: true,
    }
  }
}

function createAwsLambdaStreamingHttpDriver(
  application: AwsLambdaHttpRequestHandler,
): AwsLambdaStreamingHttpHandler {
  let initialization: Promise<void> | undefined
  return async (event, output) => {
    initialization ??= application.initialize?.() ?? Promise.resolve()
    await initialization
    const response = await application.fetch(toRequest(event))
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
    let completed = false
    let failure: unknown
    try {
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
      completed = true
    } catch (error) {
      failure = error
      throw error
    } finally {
      if (reader && !completed) {
        try {
          await reader.cancel(failure)
        } catch {
          // cancel失敗でresponse pumpの元errorを上書きしない。
        }
      }
    }
    stream.end()
  }
}

function responseMetadata(
  response: Response,
): Pick<AwsLambdaHttpResult, 'headers' | 'cookies'> {
  const headers = Object.fromEntries(
    [...response.headers.entries()].filter(([name]) => name !== 'set-cookie'),
  )
  const cookies = response.headers.getSetCookie()
  return {
    headers,
    ...(cookies.length === 0 ? {} : { cookies }),
  }
}

function toRequest(event: AwsLambdaHttpEvent): Request {
  const path = event.rawPath ?? '/'
  const query = event.rawQueryString ? `?${event.rawQueryString}` : ''
  const body = event.body
    ? event.isBase64Encoded
      ? Buffer.from(event.body, 'base64')
      : event.body
    : undefined
  return new Request(`https://aws-lambda.local${path}${query}`, {
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
    handler: AwsLambdaStreamingHttpHandler,
  ): AwsLambdaStreamingHttpHandler
  readonly HttpResponseStream?: {
    from(
      output: AwsLambdaResponseStream,
      metadata: {
        readonly statusCode: number
        readonly headers: Readonly<Record<string, string>>
        readonly multiValueHeaders?: Readonly<Record<string, readonly string[]>>
      },
    ): AwsLambdaResponseStream
  }
}

function awsLambdaGlobal(): AwsLambdaGlobal | undefined {
  return (globalThis as typeof globalThis & { awslambda?: unknown })
    .awslambda as AwsLambdaGlobal | undefined
}
