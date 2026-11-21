import { args } from '@loutrejs/loutre'
import { z } from 'zod'

export class AppArgs extends args(
  z.object({
    name: z.string().min(1).default('World'),
  }),
) {}
