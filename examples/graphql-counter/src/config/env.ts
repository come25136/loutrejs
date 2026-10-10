import { defineEnv } from '@loutrejs/loutre'
import { z } from 'zod'

export class AppEnv extends defineEnv(
  z
    .object({
      PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    })
    .transform((env) => ({ port: env.PORT })),
) {}
