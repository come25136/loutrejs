import { defineEnv } from '@loutrejs/loutre'
import { z } from 'zod'

const AppEnvSchema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(3003),
  })
  .transform((env) => ({ port: env.PORT }))

export class AppEnv extends defineEnv(AppEnvSchema) {}
