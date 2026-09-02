import { layer } from '@loutrejs/loutre'
import { CURRENT_USER } from './authentication.js'

export const authorization = layer({
  name: 'authorization.users.create',
  role: 'guard',
  requires: [CURRENT_USER],
  factory: () => async (ctx, next) => {
    if (ctx.currentUser.id.length === 0) {
      throw new Error('Could not identify the user')
    }
    await next()
  },
})
