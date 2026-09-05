import { defineLayer } from '@loutrejs/loutre'
import type { HttpExecutionResult, HttpLayerContext } from '@loutrejs/http'

export const authentication = defineLayer<
  HttpLayerContext,
  { readonly currentUser: { readonly id: string } },
  HttpExecutionResult
>({
  name: 'authentication.demo',
  factory: () => async (_context, next) =>
    next({ currentUser: { id: 'demo-user' } }),
})
