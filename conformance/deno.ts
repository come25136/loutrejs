import { createDenoFetchHandler } from '@loutrefw/runtime-deno'
import { createUsersApplication } from '../fixtures/http-crud/src/index.js'
import { createEventsApplication } from '../fixtures/streaming/src/index.js'

const application = createUsersApplication()
const handler = createDenoFetchHandler(application)
const response = await handler(
  new Request('https://deno.fixture/users/deno-user'),
)
const body = await response.json()
if (
  response.status !== 200 ||
  body.id !== 'deno-user' ||
  body.name !== 'test'
) {
  throw new Error(`Deno conformanceに失敗しました: ${JSON.stringify(body)}`)
}
await application.shutdown('conformance')

const events = createEventsApplication()
const streamResponse = await createDenoFetchHandler(events)(
  new Request('https://deno.fixture/events'),
)
if (!(await streamResponse.text()).includes('"sequence":3')) {
  throw new Error('Deno server-stream conformanceに失敗しました')
}
await events.shutdown('conformance')
console.log('Deno 2.9 LTS conformance: 成功')
