import type { HttpApplication } from '@loutrefw/http'

export const lambdaRuntime = {
  runtime: 'aws-lambda-nodejs24.x',
  capabilities: new Set([
    'http.server',
    'http.response.streaming',
    'stream.readable',
    'stream.writable',
    'env.runtime',
    'crypto.random',
  ]),
} as const

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
  readonly body: string
  readonly isBase64Encoded: boolean
}

export function createLambdaHandler(application: HttpApplication) {
  return async (event: LambdaHttpEvent): Promise<LambdaHttpResult> => {
    const response = await application.handle(toRequest(event))
    return {
      statusCode: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body: Buffer.from(await response.arrayBuffer()).toString('base64'),
      isBase64Encoded: true,
    }
  }
}

export interface LambdaResponseStream {
  write(chunk: Uint8Array): boolean
  end(): void
  once?(event: 'drain', listener: () => void): unknown
  setMetadata?(metadata: {
    readonly statusCode: number
    readonly headers: Readonly<Record<string, string>>
  }): void
}

export function createLambdaStreamingHandler(application: HttpApplication) {
  return async (
    event: LambdaHttpEvent,
    output: LambdaResponseStream,
  ): Promise<void> => {
    const response = await application.handle(toRequest(event))
    output.setMetadata?.({
      statusCode: response.status,
      headers: Object.fromEntries(response.headers.entries()),
    })
    const reader = response.body?.getReader()
    if (reader) {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        if (!output.write(chunk.value) && output.once) {
          await new Promise<void>((resolve) => {
            output.once?.('drain', resolve)
          })
        }
      }
    }
    output.end()
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
