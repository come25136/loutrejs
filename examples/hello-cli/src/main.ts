import { parseArgs } from 'node:util'
import { bootstrap } from '@loutrejs/loutre/host'
import application, { hello } from './app.js'

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
