import { domainError } from '@loutrejs/loutre'
import { http, type HttpHandlers } from '@loutrejs/loutre/http'
import { z } from 'zod'

const Missing = domainError({ code: 'MISSING', data: z.string() })
const routes = {
  one: {
    method: 'GET',
    path: '/one',
    responses: {
      small: { status: 200, body: z.string() },
      large: { status: 200, body: z.number() },
      failed: { status: 404, body: z.string(), error: http.error(Missing) },
    },
  },
  two: {
    method: 'GET',
    path: '/two',
    responses: { small: { status: 200, body: z.string() } },
  },
} as const
const api = http.contract(routes)
const other = http.contract({
  ...routes,
  two: { ...routes.two, path: '/other' },
})
type One = HttpHandlers<typeof api>['one']
const good: One = async () => ({ schema: api.one.large, body: 5 })
// @ts-expect-error statusが同じでもbodyは選んだ応答に従う
const badBody: One = () => ({ schema: api.one.small, body: 5 })
// @ts-expect-error 他のoperationに属する同じ形の応答
const wrongRoute: One = () => ({ schema: api.two.small, body: 'ok' })
// @ts-expect-error 他のContractに属する応答
const wrongContract: One = () => ({ schema: other.one.small, body: 'ok' })
// @ts-expect-error DomainErrorに対応する応答はthrowで選択する
const mapped: One = () => ({ schema: api.one.failed, body: 'error' })
// @ts-expect-error 成功応答でもbody直接returnは許可しない
const bare: One = () => 'ok'
// @ts-expect-error kindはContractの予約名
http.contract({ kind: routes.two })
// @ts-expect-error 階層化したoperationにも予約名が適用される
http.contract({ api: { routes: { routes: routes.two } } })
http.implementation({
  contract: api,
  // @ts-expect-error 未宣言のhandlerを実装できない
  factory: () => ({
    one: good,
    two: () => ({ schema: api.two.small, body: 'ok' }),
    third: () => 'extra',
  }),
})
void [badBody, wrongRoute, wrongContract, mapped, bare]
