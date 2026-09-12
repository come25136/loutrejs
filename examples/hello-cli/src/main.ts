import { parseArgs } from 'node:util'
import { bootstrapApplication } from '@loutrejs/loutre'
import application from './app.js'
import { hello } from './hello/task.js'

const { values } = parseArgs({
  options: {
    name: {
      type: 'string',
      short: 'n',
      default: 'World',
    },
  },
})

await using app = await bootstrapApplication({
  application,
  arguments: {
    name: values.name,
  },
})

console.log(await app.tasks.run(hello))
