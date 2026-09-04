import { type, layer } from '@loutrejs/loutre'

export const authentication = layer({
  name: 'authentication.demo',
  state: type<{
    currentUser: {
      readonly id: string
    }
  }>(),
  factory: () => async (_ctx, next) => {
    await next({ currentUser: { id: 'demo-user' } })
  },
})
