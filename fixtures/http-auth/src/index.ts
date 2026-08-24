import {
  contract,
  contextKey,
  defineModule,
  implement,
  layer,
  procedure,
} from '@loutrefw/core'
import {
  ContextOf,
  ControllerOf,
  createHttpApplication,
  http,
  validate,
} from '@loutrefw/http'
import { z } from 'zod'

export interface AuthState {
  readonly principal: { readonly id: string } | null
}

export interface Session {
  readonly principal: { readonly id: string }
}

export interface CurrentTenant {
  readonly id: string
}

export const AUTH = contextKey('auth').of<AuthState>()
export const SESSION = contextKey('session').of<Session>()
export const CURRENT_TENANT = contextKey('currentTenant').of<CurrentTenant>()

interface HeadersContext {
  readonly headers: { readonly authorization: string }
}

export const bearerAuthentication = layer({
  name: 'bearerAuthentication',
  role: 'authentication',
  requiresValidated: ['headers'],
  provides: [AUTH],
  inbound: (ctx: HeadersContext) => {
    const value = ctx.headers.authorization
    return {
      auth: {
        principal: value === 'Bearer fixture-token' ? { id: 'user-1' } : null,
      },
    }
  },
})

export const authenticated = layer({
  name: 'authenticated',
  role: 'guard',
  requires: [AUTH],
  provides: [SESSION],
  inbound: (ctx) => {
    if (!ctx.auth.principal) throw new Error('認証が必要です')
    return { session: { principal: ctx.auth.principal } }
  },
})

export const tenantAccess = layer({
  name: 'tenantAccess',
  role: 'guard',
  requires: [SESSION],
  provides: [CURRENT_TENANT],
  inbound: (ctx) => {
    return { currentTenant: { id: `tenant-${ctx.session.principal.id}` } }
  },
})

export const AccountContract = contract({
  get: procedure({
    protocols: {
      http: http({
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
      }),
    },
  }),
})

type AccountHttp = ControllerOf<typeof AccountContract, 'http'>

export class AccountController implements AccountHttp {
  get(ctx: ContextOf<AccountHttp, 'get'>) {
    return ctx.response.found({
      body: {
        userId: ctx.session.principal.id,
        tenantId: ctx.currentTenant.id,
      },
    })
  }
}

export const AccountModule = defineModule(() => ({
  description: 'Bearer認証と任意Execution Contextのcanonical fixture',
  implementations: [
    implement(AccountContract).for(http).with(AccountController),
  ],
}))

export function createAccountApplication() {
  return createHttpApplication({ modules: [AccountModule()] })
}
