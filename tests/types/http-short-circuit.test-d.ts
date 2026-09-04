import {
  type,
  layer,
  type PipelineItem,
  registerLayerShortCircuits,
  shortCircuit,
  type Type,
} from '@loutrejs/loutre'
import { basicAuth, http } from '@loutrejs/loutre/http'
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

const staticShortCircuits: readonly [] = authentication.shortCircuits
void staticShortCircuits

interface UserlandAuthContext {
  readonly input: {
    readonly headers: Readonly<Record<string, string | undefined>>
  }
}

interface UserlandAuthDefinition<
  TContribution extends object,
  TResponse extends string,
  TBody,
> {
  readonly state: Type<TContribution>
  readonly factory: () => {
    readonly authenticate: (
      authorization: string,
    ) => TContribution | undefined | Promise<TContribution | undefined>
    readonly unauthorized: () => {
      readonly response: TResponse
      readonly body: TBody
    }
  }
}

function userlandAuth<
  const TContribution extends object,
  const TResponse extends string,
  TBody,
>(definition: UserlandAuthDefinition<TContribution, TResponse, TBody>) {
  const descriptor = layer({
    name: 'userlandAuth',
    state: definition.state,
    factory: () => {
      const runtime = definition.factory()
      registerLayerShortCircuits(descriptor, [
        {
          protocol: 'http',
          response: runtime.unauthorized().response,
          metadata: { status: 401 },
        },
      ])

      return async (context: UserlandAuthContext, next) => {
        const authorization = context.input.headers.authorization
        const contribution = authorization
          ? await runtime.authenticate(authorization)
          : undefined
        if (contribution === undefined) {
          const unauthorized = runtime.unauthorized()
          return shortCircuit({
            kind: 'http-result',
            response: unauthorized.response,
            body: unauthorized.body,
            headers: {
              'www-authenticate': 'Bearer realm="Userland"',
            },
          })
        }
        await next(contribution)
      }
    },
  })

  return descriptor
}

const userlandAuthentication = userlandAuth({
  state: type<{
    currentUser: { readonly id: string }
  }>(),
  factory: () => ({
    authenticate: () => ({ currentUser: { id: 'user-1' } }),
    unauthorized: () => ({
      response: 'unauthorized',
      body: { error: '認証が必要です' },
    }),
  }),
})

layer({
  name: 'userlandAuthorization',
  requires: [userlandAuthentication],
  factory: () => async (context, next) => {
    const id: string = context.state.currentUser.id
    void id
    await next()
  },
})

http.route({
  method: 'GET',
  path: '/userland-auth',
  responses: {
    unauthorized: {
      status: 401,
      body: z.object({ error: z.string() }),
      headers: z.object({ 'www-authenticate': z.string() }),
    },
  },
  pipeline: [userlandAuthentication, http.controller],
})

http.route({
  method: 'GET',
  path: '/invalid-userland-auth',
  responses: {
    unauthorized: {
      status: 401,
      body: z.object({ message: z.string() }),
      headers: z.object({ 'www-authenticate': z.string() }),
    },
  },
  // @ts-expect-error userland Layerのshort-circuit bodyもresponse schemaと一致する必要がある
  pipeline: [userlandAuthentication, http.controller],
})

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
  pipeline: [authentication, http.controller],
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

const customAuthentication = layer({
  name: 'customAuthentication',
  shortCircuits: [
    {
      protocol: 'http',
      response: 'unauthorized',
      metadata: { status: 401 },
    },
  ],
  factory: () => async (context: CustomAuthContext) =>
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
