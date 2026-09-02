import { inject, task } from '@loutrejs/loutre'
import { AppArgs } from '../config/args.js'

export const hello = task<void, string>({
  name: 'hello',
  factory:
    (args = inject(AppArgs)) =>
    () =>
      `Hello, ${args.name}!`,
})
