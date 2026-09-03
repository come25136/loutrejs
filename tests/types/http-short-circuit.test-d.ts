import {
  contextField,
  layer,
  type PipelineItem,
  shortCircuit,
} from '@loutrejs/loutre'
import {
  type BasicAuthLayerDescriptor,
  basicAuth,
  http,
} from '@loutrejs/loutre/http'
import { z } from 'zod'

const PRINCIPAL = contextField<{
  principal: {
    readonly id: string
  }
}>('principal')

const authentication = basicAuth({
  realm: 'Loutre Test',
  provide: PRINCIPAL,
  factory: () => () => undefined,
  unauthorized: {
    variant: 'unauthorized',
    body: { error: '認証が必要です' },
  },
})

// @ts-expect-error short circuit result型を消去したBasicAuthLayerDescriptorは作れない
type ErasedAuthentication = BasicAuthLayerDescriptor<typeof PRINCIPAL>
void (undefined as unknown as ErasedAuthentication)

const genericAuthentication: BasicAuthLayerDescriptor<
  typeof PRINCIPAL,
  'unauthorized',
  {
    readonly error: string
  }
> = authentication
void genericAuthentication

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
  // @ts-expect-error short circuit result型がresponse schemaの出力型と一致しない
  method: 'GET',
  path: '/invalid-protected',
  // @ts-expect-error basicAuthのunauthorized bodyはresponse schemaの出力型と一致する必要がある
  responses: {
    unauthorized: {
      status: 401,
      body: z.object({ error: z.string() }),
      headers: z.object({ 'www-authenticate': z.string() }),
    },
  },
  // @ts-expect-error shortCircuit resultとresponse宣言の双方を照合する
  pipeline: [
    basicAuth({
      realm: 'Loutre Test',
      provide: PRINCIPAL,
      factory: () => () => undefined,
      unauthorized: {
        variant: 'unauthorized',
        body: { message: '認証が必要です' },
      },
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
  // @ts-expect-error basicAuthが宣言したresponse status制約と一致する必要がある
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
  readonly headers: Readonly<Record<string, string | undefined>>
}

const customAuthentication = layer({
  name: 'customAuthentication',
  role: 'authentication',
  shortCircuits: [
    {
      protocol: 'http',
      variant: 'unauthorized',
      response: { status: 401 },
    },
  ],
  factory: () => async (context: CustomAuthContext) =>
    shortCircuit({
      kind: 'http-result',
      variant: 'unauthorized',
      body: {
        error: context.headers.authorization
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
  // @ts-expect-error ユーザー定義Layerが宣言したresponse status制約と一致する必要がある
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
