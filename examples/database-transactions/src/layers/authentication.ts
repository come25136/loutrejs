import { defineLayer } from '@loutrejs/loutre'

export const authentication = defineLayer({
  name: 'authentication.demo',
}).factory<{
  currentUser: {
    readonly id: string
  }
}>(() => async (_ctx, next) => {
  await next({ currentUser: { id: 'demo-user' } })
})
