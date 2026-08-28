import { defineApplication } from '@loutrejs/loutre'
import { defineArgs, inject, task } from '@loutrejs/loutre'
import { z } from 'zod'

export class AppArgs extends defineArgs(
  z.object({
    name: z.string().min(1).default('World'),
  }),
) {}

export const hello = task<void, string>({
  name: 'hello',
  factory:
    (args = inject(AppArgs)) =>
    () =>
      `Hello, ${args.name}!`,
})

export default defineApplication({
  modules: [],
  arguments: AppArgs,
  tasks: [hello],
})
