import { defineEnv } from '@loutrejs/loutre'
import { z } from 'zod'

const AppEnvSchema = z
  .object({
    PORT: z.coerce.number().int().min(1).max(65535).default(3002),
    DRIZZLE_DATABASE_URL: z
      .string()
      .default('postgres://loutre:loutre@127.0.0.1:54322/loutre_drizzle'),
  })
  .transform((env) => ({
    port: env.PORT,
    databaseUrl: new URL(env.DRIZZLE_DATABASE_URL),
  }))

export class AppEnv extends defineEnv(AppEnvSchema) {}
