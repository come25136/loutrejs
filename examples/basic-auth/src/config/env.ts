import { env } from '@loutrejs/loutre'
import { z } from 'zod'

const AppEnvSchema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  })
  .transform((values) => ({ port: values.PORT }))

export class AppEnv extends env(AppEnvSchema) {}
