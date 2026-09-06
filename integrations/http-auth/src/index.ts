import {
  defineApplication,
  defineLayer,
  defineModule,
  type GenericLayerContext,
} from '@loutrejs/loutre'
import { http, type HttpMiddlewareContext } from '@loutrejs/loutre/http'
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

type HeadersContext = HttpMiddlewareContext & {
  readonly input: HttpMiddlewareContext['input'] & {
    readonly headers: {
      readonly authorization: string
    }
  }
}

export const bearerAuthentication = defineLayer<
  { auth: AuthState },
  HeadersContext
>({
  name: 'bearerAuthentication',
  factory: () => async (ctx, next) => {
    const value = ctx.input.headers.authorization
    await next({
      auth: {
        principal: value === 'Bearer example-token' ? { id: 'user-1' } : null,
      },
    })
  },
})

export const authenticated = defineLayer<
  { session: Session },
  HttpMiddlewareContext & GenericLayerContext<{ auth: AuthState }>
>({
  name: 'authenticated',
  factory: () => async (ctx, next) => {
    if (!ctx.state.auth.principal) throw new Error('Authentication required')
    await next({ session: { principal: ctx.state.auth.principal } })
  },
})

export const tenantAccess = defineLayer<
  { currentTenant: CurrentTenant },
  HttpMiddlewareContext & GenericLayerContext<{ session: Session }>
>({
  name: 'tenantAccess',
  factory: () => async (ctx, next) => {
    await next({
      currentTenant: { id: `tenant-${ctx.state.session.principal.id}` },
    })
  },
})

export const AccountContract = http.contract({
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
    middlewares: [bearerAuthentication, authenticated, tenantAccess],
  },
})

export const AccountController = http.implementation({
  name: 'AccountController',
  contract: AccountContract,
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
  description: 'Bearer authentication and Execution Context integration',
  executions: [AccountController],
}))

export function createAccountApplication() {
  return defineApplication({ modules: [AccountModule()] })
}
