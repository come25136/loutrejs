import { type, layer, type PipelineItem, shortCircuit } from '@loutrejs/loutre'
import {
  type BasicAuthLayerDescriptor,
  basicAuth,
  http,
} from '@loutrejs/loutre/http'
import { z } from 'zod'

const authentication = basicAuth({
  realm: 'Loutre Test',
  state: type<{}>(),
  factory: () => ({
    authenticate: () => undefined,
    unauthorized: () => ({
      response: 'unauthorized',
      body: { error: '認証が必要です' },
    }),
  }),
})

// @ts-expect-error BasicAuthLayerDescriptorはcontribution/response/bodyを指定する
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type ErasedAuthentication = BasicAuthLayerDescriptor<{}>

const genericAuthentication: BasicAuthLayerDescriptor<
  {},
  'unauthorized',
  { readonly error: string }
> = authentication
void genericAuthentication
const staticShortCircuits: readonly [] = authentication.shortCircuits
void staticShortCircuits

http.route({
  method: 'GET',
  path: '/protected',
  responses: {
    unauthorized: {
      status: 401,
      body: z.object({ error: z.string() }),
      headers: z.object({ 'www-authenticate': z.string() }),
    },
  },
  pipeline: [genericAuthentication, http.controller],
})

http.route({
  // @ts-expect-error incompatible short-circuit body makes the route invalid
  method: 'GET',
  path: '/invalid-protected',
  // @ts-expect-error incompatible short-circuit body makes responses invalid
  responses: {
    unauthorized: {
      status: 401,
      body: z.object({ error: z.string() }),
      headers: z.object({ 'www-authenticate': z.string() }),
    },
  },
  // @ts-expect-error short-circuit bodyとresponse schemaが一致しない
  pipeline: [
    basicAuth({
      realm: 'Loutre Test',
      state: type<{}>(),
      factory: () => ({
        authenticate: () => undefined,
        unauthorized: () => ({
          response: 'unauthorized',
          body: { message: '認証が必要です' },
        }),
      }),
    }),
    http.controller,
  ],
})

http.route({
  method: 'GET',
  path: '/invalid-basic-auth-status',
  responses: {
    unauthorized: {
      status: 403,
      body: z.object({ error: z.string() }),
      headers: z.object({ 'www-authenticate': z.string() }),
    },
  },
  pipeline: [authentication, http.controller],
})

const widenedPipeline: readonly PipelineItem[] = [
  authentication,
  http.controller,
]

http.route({
  method: 'GET',
  path: '/widened-pipeline',
  responses: {
    unauthorized: {
      status: 401,
      body: z.object({ error: z.string() }),
      headers: z.object({ 'www-authenticate': z.string() }),
    },
  },
  // @ts-expect-error Pipeline tupleをPipelineItem[]へ型消去できない
  pipeline: widenedPipeline,
})

interface CustomAuthContext {
  readonly input: {
    readonly headers: Readonly<Record<string, string | undefined>>
  }
}

type CustomUnauthorized = {
  readonly kind: 'http-result'
  readonly response: 'unauthorized'
  readonly body: { readonly error: string }
}

const customAuthentication = layer({
  name: 'customAuthentication',
  shortCircuits: [
    {
      protocol: 'http',
      response: 'unauthorized',
      metadata: { status: 401 },
    },
  ],
  context: type<CustomAuthContext>(),
  result: type<CustomUnauthorized>(),
  factory: () => async (context) =>
    shortCircuit({
      kind: 'http-result' as const,
      response: 'unauthorized' as const,
      body: {
        error: context.input.headers.authorization
          ? '資格情報が正しくありません'
          : '独自認証が必要です',
      },
    }),
})

http.route({
  method: 'GET',
  path: '/missing-basic-auth-header-schema',
  responses: {
    unauthorized: {
      status: 401,
      body: z.object({ error: z.string() }),
    },
  },
  // @ts-expect-error basicAuthが返すwww-authenticate headerはresponse schemaで宣言する必要がある
  pipeline: [authentication, http.controller],
})

http.route({
  method: 'GET',
  path: '/custom-protected',
  responses: {
    unauthorized: {
      status: 401,
      body: z.object({ error: z.string() }),
    },
  },
  pipeline: [customAuthentication, http.controller],
})

http.route({
  method: 'GET',
  path: '/invalid-custom-status',
  responses: {
    unauthorized: {
      status: 403,
      body: z.object({ error: z.string() }),
    },
  },
  pipeline: [customAuthentication, http.controller],
})

http.route({
  method: 'GET',
  path: '/invalid-custom-protected',
  responses: {
    unauthorized: {
      status: 401,
      body: z.object({ message: z.string() }),
    },
  },
  // @ts-expect-error ユーザー定義Layerのshort-circuit resultもresponse schemaの出力型と一致する必要がある
  pipeline: [customAuthentication, http.controller],
})
