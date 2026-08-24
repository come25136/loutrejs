import {
  contract,
  contextKey,
  defineEnv,
  implement,
  layer,
  provide,
  procedure,
  token,
} from '@loutrefw/core'
import {
  ContextOf,
  ControllerOf,
  http,
  validate,
} from '@loutrefw/http'
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
        input: { params: z.object({ id: z.string() }) },
        responses: {
          found: {
            status: 200,
            body: z.object({ id: z.string(), name: z.string() }),
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
        input: { params: z.object({ id: z.string() }) },
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

const AfterTerminalContract = contract({
  run: procedure({
    protocols: {
      http: http({
        method: 'GET',
        path: '/after-terminal',
        responses: { ok: { status: 200, body: z.string() } },
        pipeline: [http.controller, sessionLayer],
      }),
    },
  }),
})
type AfterTerminalHttp = ControllerOf<typeof AfterTerminalContract, 'http'>
declare const afterTerminalContext: ContextOf<AfterTerminalHttp, 'run'>
// @ts-expect-error terminalより後ろのLayerがprovideするpropertyは取得できない
afterTerminalContext.session

// @ts-expect-error Layerが宣言していないContext propertyは返せない
layer({
  name: 'invalid-provide',
  provides: [SESSION],
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
layer<HeadersContext>({
  name: 'typed-headers',
  provides: [OTHER_SESSION],
  inbound: (ctx) => {
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

provide(STORAGE).select(TestEnv.key('DRIVER'), {
  memory: MemoryStorage,
  s3: S3Storage,
})

// @ts-expect-error finite Env unionの全branchを指定する必要がある
provide(STORAGE).select(TestEnv.key('DRIVER'), { memory: MemoryStorage })
