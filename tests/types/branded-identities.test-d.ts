import { z } from 'zod'
import {
  buildApplicationModel,
  defineModule,
  defineEnv,
  loadEnv,
  runtimeCapability,
  token,
  syntheticExecutionId,
  epochNow,
  monotonicNow,
  milliseconds,
  seconds,
  elapsed,
  expiresAt,
  type ApplicationModelEdge,
  type ModuleId,
  type ProviderNodeId,
  type ModelNodeId,
  type CapabilityIdentity,
  type RuntimeExecutionMetadata,
  type Token,
} from '@loutrejs/loutre'
import {
  http,
  parseHttpPath,
  matchHttpPath,
  requestPathname,
  type HttpPathTemplate,
} from '@loutrejs/loutre/http'
import {
  parseTraceId,
  parseSpanId,
  parseCapsuleId,
  type TraceId,
  type CapsuleId,
} from '@loutrejs/loutre/devtools'
import {
  utf8ByteOffset,
  type Utf16Index,
} from '../../packages/cli/src/source-position.js'

class Service {}
const model = buildApplicationModel({
  modules: [defineModule({ providers: [Service] })],
})
const moduleNode = model.nodes.find((node) => node.kind === 'module')!
const providerNode = model.nodes.find((node) => node.kind === 'provider')!
const moduleId: ModuleId = moduleNode.id
const providerId: ProviderNodeId = providerNode.id
// @ts-expect-error ProviderのIDを所属ModuleのIDとして扱えない。
const wrongOwner: ModuleId = providerId
const validEdge: ApplicationModelEdge = {
  kind: 'owns',
  from: moduleId,
  to: providerId,
}
const wrongImport = { kind: 'imports' as const, from: moduleId, to: providerId }
// @ts-expect-error importsの接続先はModuleだけである。
const invalidEdge: ApplicationModelEdge = wrongImport
const moduleValues = new Map<ModuleId, object>()
// @ts-expect-error Module単位のlookupにProviderのIDを使えない。
moduleValues.get(providerId)

const synthetic = syntheticExecutionId('http.not-found')
const metadata: RuntimeExecutionMetadata = {
  executionId: synthetic,
  executionKind: 'http.request',
}
// @ts-expect-error 合成executionはModel nodeを表さない。
const syntheticNode: ModelNodeId = synthetic
// @ts-expect-error CapabilityとExtensionのsymbol identityを交換できない。
const wrongIdentity: CapabilityIdentity = http.extension.identity
const capability = runtimeCapability<number>('fixture.counter')

// @ts-expect-error epoch時刻はmonotonicな経過時間計測へ渡せない。
elapsed(epochNow(), monotonicNow())
// @ts-expect-error 秒の値をミリ秒のTTLとして渡せない。
expiresAt(epochNow(), seconds(1))
const expiration = expiresAt(epochNow(), milliseconds(1_000))
// @ts-expect-error UTF-8のバイト位置とJS文字列のindexは異なる。
const index: Utf16Index = utf8ByteOffset(4)

const trace = parseTraceId('trace')!
const span = parseSpanId('span')!
const capsule = parseCapsuleId('capsule')!
// @ts-expect-error SpanをTraceとして扱えない。
const wrongTrace: TraceId = span
const capsules = new Map<CapsuleId, object>()
// @ts-expect-error TraceをCapsuleの検索に使えない。
capsules.get(trace)
const path = parseHttpPath('/users/{id}')
matchHttpPath(path, requestPathname('/users/123'))
// @ts-expect-error requestのpathnameは宣言用のpath templateと異なる。
const template: HttpPathTemplate = requestPathname('/users/123')

type OtherCopyModuleId = string & { readonly '~loutre.model-node-id': 'module' }
declare const otherCopy: OtherCopyModuleId
const compatible: ModuleId = otherCopy
const reverseCompatible: OtherCopyModuleId = moduleId
const counter: Token<number> = token<number>('counter')
const plainToken = { kind: 'token' as const, id: 'counter', key: counter.key }
// @ts-expect-error 通常のobject literalはToken factoryの出力ではない。
const fabricated: Token<number> = plainToken

const userId = z.string().brand<'UserId'>()
type UserId = z.output<typeof userId>
const Env = defineEnv(z.object({ OWNER: userId }))
const owner: UserId = (await loadEnv(Env, { OWNER: 'owner' })).OWNER
const contract = http.contract({
  user: {
    method: 'GET',
    path: '/users/{id}',
    request: { params: { id: userId } },
    responses: { ok: { status: 200, body: z.object({ id: userId }) } },
  },
})
http.implementation({
  contract,
  factory: () => ({
    user(context) {
      const id: UserId = context.input.params.id
      return context.response.ok({ body: { id } })
    },
  }),
})
void [
  wrongOwner,
  validEdge,
  invalidEdge,
  metadata,
  syntheticNode,
  wrongIdentity,
  capability,
  expiration,
  index,
  wrongTrace,
  capsule,
  template,
  compatible,
  reverseCompatible,
  fabricated,
  counter,
  owner,
]
