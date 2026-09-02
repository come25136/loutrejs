import { parseArgs } from 'node:util'
import { bootstrap } from '@loutrejs/loutre/host'
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

await using app = bootstrap({
  application,
  arguments: {
    name: values.name,
  },
})

console.log(await app.run(hello))
