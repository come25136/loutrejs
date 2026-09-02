import { contract } from '@loutrejs/loutre'
import { http, validate } from '@loutrejs/loutre/http'
import { z } from 'zod'
import { transaction } from '../layers/transaction.js'

const CreateUserBody = z.object({ name: z.string().min(1) })

const UserResponse = z.object({
  id: z.string(),
  name: z.string(),
  createdBy: z.string(),
})

export const UsersContract = contract([
  http({
    create: {
      method: 'POST',
      path: '/users',
      request: {
        body: {
          contentType: 'application/json',
          schema: CreateUserBody,
        },
      },
      responses: {
        created: { status: 201, body: UserResponse },
      },
      pipeline: [validate.body, transaction([http.controller])],
    },
  }),
])
