import {
  contract,
  contextKey,
  defineError,
  defineEnv,
  implement,
  layer,
  provide,
  procedure,
  token,
} from '@loutrejs/core'
import {
  ContextOf,
  ControllerOf,
  http,
  validate,
} from '@loutrejs/http'
import { z } from 'zod'

interface Session {
  readonly userId: string
}
interface OtherSession {
  readonly accountId: string
}
const SESSION = contextKey('session').of<Session>()
const OTHER_SESSION = contextKey('otherSession').of<OtherSession>()
const sessionLayer = layer({
  name: 'session',
  provides: [SESSION],
  inbound: () => ({ session: { userId: 'user-1' } }),
})

const Contract = contract({
  get: procedure({
    protocols: {
      http: http({
        method: 'GET',
        path: '/users/{id}',
        request: { params: z.object({ id: z.string() }) },
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
        pipeline: [validate.params, sessionLayer, http.controller],
      }),
    },
  }),
  list: procedure({
    protocols: {
      http: http({
        method: 'GET',
        path: '/users',
        responses: { ok: { status: 200, body: z.array(z.string()) } },
        pipeline: [http.controller],
      }),
    },
  }),
  unvalidated: procedure({
    protocols: {
      http: http({
        method: 'GET',
        path: '/raw/{id}',
        request: { params: z.object({ id: z.string() }) },
        responses: { ok: { status: 200, body: z.string() } },
        pipeline: [http.controller],
      }),
    },
  }),
})

type HttpController = ControllerOf<typeof Contract, 'http'>
declare const context: ContextOf<HttpController, 'get'>

const id: string = context.params.id
void id
context.response.found({ body: { id: '1', name: 'Ada' } })
context.response.found({
  body: { id: '1', name: 'Ada' },
  headers: { etag: 'user-1', vary: ['accept', 'authorization'] },
})
// @ts-expect-error response headerの値はstringまたはreadonly string[]のみ
context.response.found({ body: { id: '1', name: 'Ada' }, headers: { etag: 1 } })
// @ts-expect-error response schemaにないheaderは返せない
context.response.found({ body: { id: '1', name: 'Ada' }, headers: { location: '/users/1' } })

const session: Session = context.session
void session

// @ts-expect-error Pipelineがprovideしていないtokenは取得できない
context.otherSession

declare const listContext: ContextOf<HttpController, 'list'>
// @ts-expect-error 別procedureのPipelineがprovideするtokenは取得できない
listContext.session

// @ts-expect-error validation後のparams.idはnumberではない
const invalidId: number = context.params.id
void invalidId

// @ts-expect-error named responseのbody型はschemaから導出される
context.response.found({ body: { id: '1' } })

class GetController {
  get(_context: ContextOf<HttpController, 'get'>) {
    return context.response.found({ body: { id: '1', name: 'Ada' } })
  }
}

implement(Contract).for(http).procedures('get').with(GetController)

class DirectGetController {
  get() {
    return {
      kind: 'http-result' as const,
      variant: 'found' as const,
      body: { id: '1', name: 'Ada' },
    }
  }
}

implement(Contract).for(http).procedures('get').with(DirectGetController)

class UndeclaredResultController {
  get() {
    return {
      kind: 'http-result' as const,
      variant: 'missing' as const,
      body: { id: '1', name: 'Ada' },
    }
  }
}

// @ts-expect-error Controllerが直接返すresultもContractのresponse variantと一致する必要がある
implement(Contract).for(http).procedures('get').with(UndeclaredResultController)

class InvalidController {
  get() {
    return 42
  }
}
// @ts-expect-error implementation methodのreturn型がContractと互換でない
implement(Contract).for(http).procedures('get').with(InvalidController)

type RawContext = ContextOf<HttpController, 'unvalidated'>
declare const rawContext: RawContext
// @ts-expect-error validate.paramsがないためparamsはunknownのまま
rawContext.params.id

http({
  method: 'GET',
  path: '/after-terminal',
  responses: { ok: { status: 200, body: z.string() } },
  // @ts-expect-error terminalより後ろにPipelineItemは置けない
  pipeline: [http.controller, sessionLayer],
})

layer({
  name: 'invalid-provide',
  provides: [SESSION],
  // @ts-expect-error Layerが宣言していないContext propertyは返せない
  inbound: () => ({ otherSession: { accountId: 'account-2' } }),
})

layer({
  name: 'invalid-resolve',
  requires: [SESSION],
  inbound: (ctx) => {
    const available: Session = ctx.session
    void available
    // @ts-expect-error LayerがrequireしていないContext propertyは参照できない
    ctx.otherSession
  },
})

interface HeadersContext {
  readonly headers: { readonly authorization: string }
}
layer({
  name: 'typed-headers',
  provides: [OTHER_SESSION],
  inbound: (ctx: HeadersContext) => {
    const authorization: string = ctx.headers.authorization
    return { otherSession: { accountId: authorization } }
  },
})

// @ts-expect-error 未定義のprocedureは選択できない
implement(Contract).for(http).procedures('missing').with(GetController)

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

http({
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
