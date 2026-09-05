import { http } from '@loutrejs/http'
import { User } from '../auth/user.js'

export const ProfileContract = http.contract({
  profile: {
    method: 'GET',
    path: '/profile',
    responses: {
      ok: {
        status: 200,
        body: User,
      },
    },
  },
})
