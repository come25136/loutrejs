import { defineLayer } from '@loutrejs/loutre'

export const authentication = defineLayer<{
  readonly currentUser: { readonly id: string }
}>({
  name: 'authentication.demo',
  factory: () => async (_context, next) =>
    next({ currentUser: { id: 'demo-user' } }),
})
