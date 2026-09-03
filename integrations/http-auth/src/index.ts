import { defineApplication } from '@loutrejs/loutre'
import {
  contract,
  contextKey,
  defineModule,
  implementation,
  layer,
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
export const AUTH = contextKey<{ auth: AuthState }>('auth')
export const SESSION = contextKey<{ session: Session }>('session')
export const CURRENT_TENANT = contextKey<{ currentTenant: CurrentTenant }>(
  'currentTenant',
)
interface HeadersContext {
  readonly headers: {
    readonly authorization: string
  }
}
export const bearerAuthentication = layer({
  name: 'bearerAuthentication',
  role: 'authentication',
  requiresValidated: ['headers'],
  provide: AUTH,
  factory: () => async (ctx: HeadersContext, next) => {
    const value = ctx.headers.authorization
    await next({
      auth: {
        principal: value === 'Bearer example-token' ? { id: 'user-1' } : null,
      },
    })
  },
})
export const authenticated = layer({
  name: 'authenticated',
  role: 'guard',
  requires: [AUTH],
  provide: SESSION,
  factory: () => async (ctx, next) => {
    if (!ctx.auth.principal) throw new Error('Authentication required')
    await next({ session: { principal: ctx.auth.principal } })
  },
})
export const tenantAccess = layer({
  name: 'tenantAccess',
  role: 'guard',
  requires: [SESSION],
  provide: CURRENT_TENANT,
  factory: () => async (ctx, next) => {
    await next({
      currentTenant: { id: `tenant-${ctx.session.principal.id}` },
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
          userId: ctx.session.principal.id,
          tenantId: ctx.currentTenant.id,
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
