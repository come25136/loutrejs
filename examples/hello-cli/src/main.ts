import { parseArgs } from 'node:util'
import { bootstrap } from '@loutrejs/application/host'
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

const app = bootstrap({
  application,
  arguments: {
    name: values.name,
  },
})

try {
  console.log(await app.run(hello))
} finally {
  await app.close('cli-complete')
}
