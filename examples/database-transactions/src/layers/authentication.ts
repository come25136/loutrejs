import { contextKey, layer } from '@loutrejs/loutre'

export const CURRENT_USER = contextKey<{
  currentUser: {
    readonly id: string
  }
}>('currentUser')

export const authentication = layer({
  name: 'authentication.demo',
  role: 'authentication',
  provide: CURRENT_USER,
  factory: () => async (_ctx, next) => {
    await next({ currentUser: { id: 'demo-user' } })
  },
})
