import { contextKey, layer } from '@loutrejs/loutre'

export const CURRENT_USER = contextKey('currentUser').of<{
  readonly id: string
}>()

export const authentication = layer({
  name: 'authentication.demo',
  role: 'authentication',
  provides: [CURRENT_USER],
  factory: () => async (_ctx, next) => {
    await next({ currentUser: { id: 'demo-user' } })
  },
})
