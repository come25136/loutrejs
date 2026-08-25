import { createDenoFetchHandler } from '@loutrejs/runtime-deno'
import usersApplication from '../dist/conformance/http-crud/application.mjs'
import eventsApplication from '../dist/conformance/streaming-http/application.mjs'
const handler = createDenoFetchHandler(usersApplication)
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
await usersApplication.shutdown('conformance')

const streamResponse = await createDenoFetchHandler(eventsApplication)(
  new Request('https://deno.fixture/events'),
)
if (!(await streamResponse.text()).includes('"sequence":3')) {
  throw new Error('Deno server-stream conformanceに失敗しました')
}
await eventsApplication.shutdown('conformance')
console.log('Deno 2.9 LTS conformance: 成功')
