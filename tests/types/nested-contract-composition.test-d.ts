import { type, contract, implementation, layer } from '@loutrejs/loutre'
import { http, validate } from '@loutrejs/loutre/http'
import { z } from 'zod'

interface Session {
  readonly id: string
}

interface CurrentUser {
  readonly id: string
}

const session = layer({
  name: 'nested.session',
  state: type<{
    'nested.session': Session
  }>(),
  factory: () => async (_ctx, next) => {
    await next({ 'nested.session': { id: 'session-1' } })
  },
})

const authentication = layer({
  name: 'nested.authentication',
  requires: [session],
  state: type<{
    'nested.currentUser': CurrentUser
  }>(),
  factory: () => async (ctx, next) => {
    const sessionId: string = ctx.state['nested.session'].id
    await next({ 'nested.currentUser': { id: sessionId } })
  },
})

const ProfileContract = contract([
  http({
    get: {
      method: 'GET',
      path: '/profile/{id}',
      request: {
        params: {
          id: z.string().min(2),
        },
      },
      responses: {
        ok: {
          status: 200,
          body: z.object({ id: z.string(), userId: z.string() }),
        },
      },
      pipeline: [validate.params, http.controller],
    },
  }),
])

const AppContract = contract([
  http({
    api: {
      path: '/api',
      pipeline: [session],
      responses: {
        unavailable: {
          status: 503,
          body: z.object({ error: z.string() }),
        },
      },
      routes: {
        me: {
          path: '/me',
          pipeline: [authentication],
          responses: {
            unauthorized: {
              status: 401,
              body: z.object({ error: z.string() }),
            },
          },
          routes: {
            profile: ProfileContract.http.get,
          },
        },
      },
    },
  }),
])

implementation({
  name: 'NestedProfileController',
  contract: AppContract.http.api.me.profile,
  protocol: http,
  factory: () => ({
    get(ctx) {
      const id: string = ctx.input.params.id
      const sessionValue: Session = ctx.state['nested.session']
      const currentUser: CurrentUser = ctx.state['nested.currentUser']
      void [id, sessionValue, currentUser]

      ctx.response.unavailable({ body: { error: 'unavailable' } })
      ctx.response.unauthorized({ body: { error: 'unauthorized' } })
      return ctx.response.ok({
        body: {
          id: ctx.input.params.id,
          userId: ctx.state['nested.currentUser'].id,
        },
      })
    },
  }),
})

// resolved nodeはframework内部Contract shapeをpublic surfaceへ露出しない
// @ts-expect-error resolved leafにproceduresは公開しない
AppContract.http.api.me.profile.procedures
// @ts-expect-error resolved leafにkindは公開しない
AppContract.http.api.me.profile.kind
// @ts-expect-error resolved branchにもproceduresは公開しない
AppContract.http.api.me.procedures

const PublicContract = contract([
  http({
    public: {
      path: '/public',
      routes: {
        profile: ProfileContract.http.get,
      },
    },
  }),
])

implementation({
  name: 'PublicProfileController',
  contract: PublicContract.http.public.profile,
  protocol: http,
  factory: () => ({
    get(ctx) {
      // @ts-expect-error 別mountのancestor Contextは伝播しない
      ctx.state['nested.currentUser']
      return ctx.response.ok({
        body: { id: ctx.input.params.id, userId: 'public' },
      })
    },
  }),
})

// branch pipelineにterminalは置けない
// @ts-expect-error branch pipelineのterminalを拒否する
http({
  invalid: {
    pipeline: [http.controller],
    routes: ProfileContract.http,
  },
})

// inherited response variantの衝突はcompile error
// @ts-expect-error ancestorとdescendantで同名response variantは定義できない
http({
  invalid: {
    responses: {
      ok: { status: 200, body: z.string() },
    },
    routes: ProfileContract.http,
  },
})

const BulkContract = contract([
  http({
    route01: {
      method: 'GET',
      path: '/01',
      responses: { ok: { status: 200, body: z.string() } },
      pipeline: [http.controller],
    },
    route02: {
      method: 'GET',
      path: '/02',
      responses: { ok: { status: 200, body: z.string() } },
      pipeline: [http.controller],
    },
    route03: {
      method: 'GET',
      path: '/03',
      responses: { ok: { status: 200, body: z.string() } },
      pipeline: [http.controller],
    },
    route04: {
      method: 'GET',
      path: '/04',
      responses: { ok: { status: 200, body: z.string() } },
      pipeline: [http.controller],
    },
    route05: {
      method: 'GET',
      path: '/05',
      responses: { ok: { status: 200, body: z.string() } },
      pipeline: [http.controller],
    },
    route06: {
      method: 'GET',
      path: '/06',
      responses: { ok: { status: 200, body: z.string() } },
      pipeline: [http.controller],
    },
    route07: {
      method: 'GET',
      path: '/07',
      responses: { ok: { status: 200, body: z.string() } },
      pipeline: [http.controller],
    },
    route08: {
      method: 'GET',
      path: '/08',
      responses: { ok: { status: 200, body: z.string() } },
      pipeline: [http.controller],
    },
    route09: {
      method: 'GET',
      path: '/09',
      responses: { ok: { status: 200, body: z.string() } },
      pipeline: [http.controller],
    },
    route10: {
      method: 'GET',
      path: '/10',
      responses: { ok: { status: 200, body: z.string() } },
      pipeline: [http.controller],
    },
    route11: {
      method: 'GET',
      path: '/11',
      responses: { ok: { status: 200, body: z.string() } },
      pipeline: [http.controller],
    },
    route12: {
      method: 'GET',
      path: '/12',
      responses: { ok: { status: 200, body: z.string() } },
      pipeline: [http.controller],
    },
  }),
])

const DeepContract = contract([
  http({
    v1: {
      path: '/v1',
      pipeline: [session],
      routes: {
        accounts: {
          path: '/accounts',
          pipeline: [authentication],
          routes: {
            internal: {
              path: '/internal',
              routes: {
                bulk: {
                  path: '/bulk',
                  routes: BulkContract.http,
                },
              },
            },
          },
        },
      },
    },
  }),
])

implementation({
  name: 'DeepRouteController',
  contract: DeepContract.http.v1.accounts.internal.bulk.route12,
  protocol: http,
  factory: () => ({
    route12(ctx) {
      const sessionValue: Session = ctx.state['nested.session']
      const currentUser: CurrentUser = ctx.state['nested.currentUser']
      void [sessionValue, currentUser]
      return ctx.response.ok({ body: 'ok' })
    },
  }),
})

// ancestor path解決後のmethod + path collisionをContract compile時に拒否する
// @ts-expect-error 同じeffective GET /same/profile/{id}を持つrouteは共存できない
contract([
  http({
    first: { path: '/same', routes: { profile: ProfileContract.http.get } },
    second: { path: '/same', routes: { profile: ProfileContract.http.get } },
  }),
])
