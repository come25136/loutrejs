import { createBunFetchHandler } from '@loutrejs/runtime-bun'
import usersApplication from '../dist/conformance/http-crud/application.mjs'
import eventsApplication from '../dist/conformance/streaming-http/application.mjs'
const handler = createBunFetchHandler(usersApplication)
const response = await handler(
  new Request('https://bun.fixture/users/bun-user'),
)
const body = (await response.json()) as {
  readonly id?: string
  readonly name?: string
}
if (response.status !== 200 || body.id !== 'bun-user' || body.name !== 'test') {
  throw new Error(`Bun conformanceに失敗しました: ${JSON.stringify(body)}`)
}
await usersApplication.shutdown('conformance')

const streamResponse = await createBunFetchHandler(eventsApplication)(
  new Request('https://bun.fixture/events'),
)
if (!(await streamResponse.text()).includes('"sequence":3')) {
  throw new Error('Bun server-stream conformanceに失敗しました')
}
await eventsApplication.shutdown('conformance')
console.log('Bun 1.4 Stable conformance: 成功')
