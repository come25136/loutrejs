import { inject } from '@loutrejs/loutre'
import { task } from '@loutrejs/tasks'
import { AppArgs } from '../config/args.js'

export const hello = task<void, string>({
  name: 'hello',
  factory:
    (args = inject(AppArgs)) =>
    () =>
      `Hello, ${args.name}!`,
})
