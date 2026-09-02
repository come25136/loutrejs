import { defineApplication } from '@loutrejs/loutre'
import { AppArgs } from './config/args.js'
import { hello } from './hello/task.js'

export default defineApplication({
  modules: [],
  arguments: AppArgs,
  tasks: [hello],
})
