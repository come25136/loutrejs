import { createBunFetchHandler } from '@loutrefw/runtime-bun'
import { createUsersApplication } from '../fixtures/http-crud/src/index.js'
import { createEventsApplication } from '../fixtures/streaming/src/index.js'

const application = createUsersApplication()
const handler = createBunFetchHandler(application)
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
await application.shutdown('conformance')

const events = createEventsApplication()
const streamResponse = await createBunFetchHandler(events)(
  new Request('https://bun.fixture/events'),
)
if (!(await streamResponse.text()).includes('"sequence":3')) {
  throw new Error('Bun server-stream conformanceに失敗しました')
}
await events.shutdown('conformance')
console.log('Bun 1.4 Stable conformance: 成功')
