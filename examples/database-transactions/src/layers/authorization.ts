import { defineLayer } from '@loutrejs/loutre'
import { authentication } from './authentication.js'

export const authorization = defineLayer({
  name: 'authorization.users.create',
  requires: [authentication],
}).factory(() => async (ctx, next) => {
  if (ctx.state.currentUser.id.length === 0) {
    throw new Error('Could not identify the user')
  }
  await next()
})
