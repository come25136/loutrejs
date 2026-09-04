import {
  type,
  contract,
  defineApplication,
  implementation,
  layer,
  defineModule,
} from '@loutrejs/loutre'
import { http, validate } from '@loutrejs/loutre/http'
import { z } from 'zod'

export interface AuthState {
  readonly principal: {
    readonly id: string
  } | null
}

export interface Session {
  readonly principal: {
    readonly id: string
  }
}

export interface CurrentTenant {
  readonly id: string
}

interface HeadersContext {
  readonly input: {
    readonly headers: {
      readonly authorization: string
    }
  }
}

export const bearerAuthentication = layer({
  name: 'bearerAuthentication',
  requiresValidated: ['headers'],
  state: type<{ auth: AuthState }>(),
  factory: () => async (ctx: HeadersContext, next) => {
    const value = ctx.input.headers.authorization
    await next({
      auth: {
        principal: value === 'Bearer example-token' ? { id: 'user-1' } : null,
      },
    })
  },
})

export const authenticated = layer({
  name: 'authenticated',
  requires: [bearerAuthentication],
  state: type<{ session: Session }>(),
  factory: () => async (ctx, next) => {
    if (!ctx.state.auth.principal) throw new Error('Authentication required')
    await next({ session: { principal: ctx.state.auth.principal } })
  },
})

export const tenantAccess = layer({
  name: 'tenantAccess',
  requires: [authenticated],
  state: type<{ currentTenant: CurrentTenant }>(),
  factory: () => async (ctx, next) => {
    await next({
      currentTenant: { id: `tenant-${ctx.state.session.principal.id}` },
    })
  },
})

export const AccountContract = contract([
  http({
    get: {
      method: 'GET',
      path: '/account',
      request: {
        headers: z.object({ authorization: z.string() }),
      },
      responses: {
        found: {
          status: 200,
          body: z.object({
            userId: z.string(),
            tenantId: z.string(),
          }),
        },
      },
      pipeline: [
        validate.headers,
        bearerAuthentication,
        authenticated,
        tenantAccess,
        http.controller,
      ],
    },
  }),
])

export const AccountController = implementation({
  name: 'AccountController',
  contract: AccountContract,
  protocol: http,
  factory: () => ({
    get(ctx) {
      return ctx.response.found({
        body: {
          userId: ctx.state.session.principal.id,
          tenantId: ctx.state.currentTenant.id,
        },
      })
    },
  }),
})

export const AccountModule = defineModule(() => ({
  description:
    'Bearer authentication and optional Execution Context integration',
  implementations: [AccountController],
}))

export function createAccountApplication() {
  return defineApplication({ modules: [AccountModule()] })
}
