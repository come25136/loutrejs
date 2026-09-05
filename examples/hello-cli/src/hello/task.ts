import { task } from '@loutrejs/tasks'
import { AppArgs } from '../config/args.js'

export const hello = task<void, string, readonly [typeof AppArgs]>({
  name: 'hello',
  inject: [AppArgs],
  factory: (args) => () => `Hello, ${args.name}!`,
})
