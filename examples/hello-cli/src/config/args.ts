import { defineArgs } from '@loutrejs/loutre'
import { z } from 'zod'

export class AppArgs extends defineArgs(
  z.object({
    name: z.string().min(1).default('World'),
  }),
) {}
