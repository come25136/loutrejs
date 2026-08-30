import { contract, contextKey, implementation, layer } from '@loutrejs/loutre'
import { http, validate } from '@loutrejs/loutre/http'
import { messagePort } from '@loutrejs/loutre/message-port'
import { z } from 'zod'
const SESSION = contextKey('implementation.session').of<{
  readonly userId: string
}>()
const session = layer({
  name: 'implementation-session',
  provides: [SESSION],
  factory: () => async (_ctx, next) => {
    await next({ 'implementation.session': { userId: 'user-1' } })
  },
})
const Contract = contract([
  http({
    raw: {
      method: 'GET',
      path: '/raw/{id}',
      responses: { ok: { status: 200, body: z.string() } },
      pipeline: [http.controller],
    },
    transformed: {
      method: 'POST',
      path: '/transformed/{id}',
      request: {
        params: { id: z.coerce.number() },
        query: z.object({ page: z.coerce.number() }),
        headers: z.object({ authorization: z.string() }),
        body: {
          contentType: 'application/json',
          schema: z.object({ name: z.string() }),
        },
      },
      responses: { ok: { status: 200, body: z.string() } },
      pipeline: [
        validate.params,
        validate.query,
        validate.headers,
        validate.body,
        session,
        http.controller,
      ],
    },
  }),
])
implementation({
  name: 'AllProcedures',
  contract: Contract,
  protocol: http,
  factory: () => ({
    raw(ctx) {
      const id: string = ctx.params.id
      return ctx.response.ok({ body: id })
    },
    transformed(ctx) {
      const id: number = ctx.params.id
      const page: number = ctx.query.page
      const authorization: string = ctx.headers.authorization
      const name: string = ctx.body.name
      const userId: string = ctx['implementation.session'].userId
      return ctx.response.ok({
        body: `${id}:${page}:${authorization}:${name}:${userId}`,
      })
    },
  }),
})
implementation({
  name: 'MissingProcedure',
  contract: Contract,
  protocol: http,
  // @ts-expect-error procedures省略時は指定protocolの全procedureが必要
  factory: () => ({
    raw(ctx) {
      return ctx.response.ok({ body: ctx.params.id })
    },
  }),
})
const Partial = implementation({
  name: 'Partial',
  contract: Contract,
  protocol: http,
  procedures: ['raw'],
  factory: () => ({
    raw(ctx) {
      return ctx.response.ok({ body: ctx.params.id })
    },
  }),
})
const selectedProcedure: 'raw' = Partial.procedures[0]
void selectedProcedure
implementation({
  name: 'InvalidResult',
  contract: Contract,
  protocol: http,
  procedures: ['raw'],
  // @ts-expect-error procedure resultはProtocolDescriptorのresultに一致する必要がある
  factory: () => ({ raw: () => 1 }),
})
implementation({
  name: 'InvalidProcedure',
  contract: Contract,
  protocol: http,
  // @ts-expect-error 指定protocolに存在しないprocedureは選択できない
  procedures: ['missing'],
  factory: (() => ({})) as never,
})
implementation({
  name: 'WrongProtocol',
  contract: Contract,
  // @ts-expect-error Contractに存在しないprotocolは選択できない
  protocol: messagePort,
  factory: (() => ({})) as never,
})
implementation({
  name: 'AsyncFactory',
  contract: Contract,
  protocol: http,
  procedures: ['raw'],
  // @ts-expect-error Implementation factoryは同期関数に限定する
  factory: async () => ({ raw: () => ({}) }),
})
