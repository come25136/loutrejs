import { defineLayer } from '@loutrejs/loutre'
import type { HttpExecutionResult, HttpLayerContext } from '@loutrejs/http'

export interface AuthenticatedHttpContext extends HttpLayerContext {
  readonly state: Readonly<{
    currentUser: { readonly id: string }
  }>
}

export const authorization = defineLayer<
  AuthenticatedHttpContext,
  {},
  HttpExecutionResult
>({
  name: 'authorization.users.create',
  factory: () => async (context, next) => {
    if (context.state.currentUser.id.length === 0) {
      throw new Error('Could not identify the user')
    }
    return next()
  },
})
