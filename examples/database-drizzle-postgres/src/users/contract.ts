import { http } from '@loutrejs/http'
import { z } from 'zod'
import { transaction } from '../layers/transaction.js'

const CreateUserBody = z.object({ name: z.string().min(1) })

const UserResponse = z.object({
  id: z.string(),
  name: z.string(),
  createdBy: z.string(),
})

export const UsersContract = http.contract({
  create: {
    method: 'POST',
    path: '/users',
    request: {
      headers: z.object({ 'content-type': z.literal('application/json') }),
      body: CreateUserBody,
    },
    responses: {
      created: { status: 201, body: UserResponse },
    },
    middlewares: [transaction],
  },
})
