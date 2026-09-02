import { contract } from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { User } from '../auth/user.js'

export const ProfileContract = contract([
  http({
    profile: {
      method: 'GET',
      path: '/profile',
      responses: {
        ok: {
          status: 200,
          body: User,
        },
      },
      pipeline: [http.controller],
    },
  }),
])
