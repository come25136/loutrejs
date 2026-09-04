import {
  type,
  contract,
  defineError,
  defineEnv,
  implementation,
  layer,
  provide,
  token,
} from '@loutrejs/loutre'
import { ContextOf, ControllerOf, http, validate } from '@loutrejs/loutre/http'
import { z } from 'zod'
interface Session {
  readonly userId: string
}
interface OtherSession {
  readonly accountId: string
}
const sessionLayer = layer({
  name: 'session',
  state: type<{
    session: Session
  }>(),
  factory: () => async (_ctx, next) => {
    await next({ session: { userId: 'user-1' } })
  },
})
const wrapperLayer = layer({
  name: 'wrapper',
  factory: () => async (_ctx, next) => {
    await next()
  },
})
const Contract = contract([
  http({
    get: {
      method: 'GET',
      path: '/users/{id}',
      request: { params: { id: z.string() } },
      responses: {
        found: {
          status: 200,
          body: z.object({ id: z.string(), name: z.string() }),
          headers: z
            .object({
              etag: z.string().optional(),
              vary: z.union([z.string(), z.array(z.string())]).optional(),
            })
            .optional(),
        },
      },
      pipeline: [
        validate.params,
        wrapperLayer([sessionLayer]),
        http.controller,
      ],
    },
    list: {
      method: 'GET',
      path: '/users',
      responses: { ok: { status: 200, body: z.array(z.string()) } },
      pipeline: [http.controller],
    },
    unvalidated: {
      method: 'GET',
      path: '/raw/{id}',
      request: { params: { id: z.string() } },
      responses: { ok: { status: 200, body: z.string() } },
      pipeline: [http.controller],
    },
    nestedValidated: {
      method: 'POST',
      path: '/nested-validation',
      request: {
        body: {
          contentType: 'application/json',
          schema: z.object({ name: z.string() }),
        },
      },
      responses: { ok: { status: 200, body: z.string() } },
      pipeline: [wrapperLayer([validate.body]), http.controller],
    },
  }),
])
type HttpController = ControllerOf<typeof Contract, 'http'>
declare const context: ContextOf<HttpController, 'get'>
const id: string = context.input.params.id
void id
context.response.found({ body: { id: '1', name: 'Ada' } })
context.response.found({
  body: { id: '1', name: 'Ada' },
  headers: { etag: 'user-1', vary: ['accept', 'authorization'] },
})
context.response.found({
  body: { id: '1', name: 'Ada' },
  headers: {
    // @ts-expect-error response headerの値はstringまたはreadonly string[]のみ
    etag: 1,
  },
})
context.response.found({
  body: { id: '1', name: 'Ada' },
  headers: {
    // @ts-expect-error response schemaにないheaderは返せない
    location: '/users/1',
  },
})
const session: Session = context.state.session
void session
// @ts-expect-error Pipelineがprovideしていないtokenは取得できない
context.state.otherSession
declare const listContext: ContextOf<HttpController, 'list'>
// @ts-expect-error 別procedureのPipelineがprovideするtokenは取得できない
listContext.state.session
// @ts-expect-error validation後のparams.idはnumberではない
const invalidId: number = context.input.params.id
void invalidId
// @ts-expect-error named responseのbody型はschemaから導出される
context.response.found({ body: { id: '1' } })
implementation({
  name: 'GetController',
  contract: Contract,
  protocol: http,
  procedures: ['get'],
  factory: () => ({
    get(ctx) {
      const inferredId: string = ctx.input.params.id
      void inferredId
      return ctx.response.found({ body: { id: '1', name: 'Ada' } })
    },
  }),
})
implementation({
  name: 'DirectGetController',
  contract: Contract,
  protocol: http,
  procedures: ['get'],
  factory: () => ({
    get() {
      return {
        kind: 'http-result' as const,
        response: 'found' as const,
        body: { id: '1', name: 'Ada' },
      }
    },
  }),
})
implementation({
  name: 'UndeclaredResultController',
  contract: Contract,
  protocol: http,
  procedures: ['get'],
  factory: () => ({
    // @ts-expect-error 直接返すresultもContractのresponse variantと一致する必要がある
    get() {
      return {
        kind: 'http-result' as const,
        response: 'missing' as const,
        body: { id: '1', name: 'Ada' },
      }
    },
  }),
})
implementation({
  name: 'InvalidController',
  contract: Contract,
  protocol: http,
  procedures: ['get'],
  // @ts-expect-error implementation procedureのreturn型がContractと互換でない,
  factory: () => ({ get: () => 42 }),
})
type RawContext = ContextOf<HttpController, 'unvalidated'>
declare const rawContext: RawContext
const rawId: string = rawContext.input.params.id
void rawId
type NestedValidatedContext = ContextOf<HttpController, 'nestedValidated'>
declare const nestedValidatedContext: NestedValidatedContext
const nestedValidatedName: string = nestedValidatedContext.input.body.name
void nestedValidatedName
http.route({
  method: 'GET',
  path: '/after-terminal',
  responses: { ok: { status: 200, body: z.string() } },
  // @ts-expect-error terminalより後ろにPipelineItemは置けない
  pipeline: [http.controller, sessionLayer],
})
layer({
  name: 'invalid-contribution',
  state: type<{
    session: Session
  }>(),
  factory: () => async (_ctx, next) => {
    // @ts-expect-error Layerが宣言していないstate propertyはprovideできない
    await next({ otherSession: { accountId: 'account-2' } })
  },
})

layer({
  name: 'invalid-resolve',
  requires: [sessionLayer],
  factory: () => async (ctx, next) => {
    const available: Session = ctx.state.session
    void available
    // @ts-expect-error Layerがrequireしていないstateは参照できない
    ctx.state.otherSession
    await next()
  },
})

interface HeadersContext {
  readonly input: {
    readonly headers: {
      readonly authorization: string
    }
  }
}

layer({
  name: 'typed-headers',
  state: type<{ otherSession: OtherSession }>(),
  context: type<HeadersContext>(),
  factory: () => async (ctx, next) => {
    const authorization: string = ctx.input.headers.authorization
    await next({ otherSession: { accountId: authorization } })
  },
})
implementation({
  name: 'MissingController',
  contract: Contract,
  protocol: http,
  // @ts-expect-error 未定義のprocedureは選択できない
  procedures: ['missing'],
  factory: (() => ({})) as never,
})
const EnvSchema = z.object({ DRIVER: z.enum(['memory', 's3']) })
class TestEnv extends defineEnv(EnvSchema) {}
declare const typedEnv: TestEnv
const driver: 'memory' | 's3' = typedEnv.DRIVER
void driver
interface Storage {}
class MemoryStorage implements Storage {}
class S3Storage implements Storage {}
const STORAGE = token<Storage>('storage.type-test')
const MappedError = defineError({
  code: 'MAPPED_ERROR',
  data: z.object({ message: z.string() }),
})
http.route({
  method: 'GET',
  path: '/invalid-error-mapping',
  // @ts-expect-error 必須header schemaを持つerror mappingはheaderを返す必要がある
  responses: {
    failed: {
      status: 400,
      body: z.object({ message: z.string() }),
      headers: z.object({ 'x-error-code': z.string() }),
      error: http.error(MappedError),
    },
  },
  pipeline: [http.controller],
})
provide(STORAGE).select(TestEnv.key('DRIVER'), {
  memory: MemoryStorage,
  s3: S3Storage,
})
// @ts-expect-error finite Env unionの全branchを指定する必要がある
provide(STORAGE).select(TestEnv.key('DRIVER'), { memory: MemoryStorage })
