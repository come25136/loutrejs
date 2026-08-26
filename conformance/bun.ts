import { createInvocationBinding } from '@loutrejs/application/binding'
import { createBunFetchDriver } from '@loutrejs/runtime-bun'
import usersDefinition from '../dist/conformance/http-crud/application.mjs'
import eventsDefinition from '../dist/conformance/streaming-http/application.mjs'
const usersBinding = createInvocationBinding(usersDefinition)
const eventsBinding = createInvocationBinding(eventsDefinition)
const handler = createBunFetchDriver(usersBinding.http!)
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
await usersBinding.application.close()

const streamResponse = await createBunFetchDriver(eventsBinding.http!)(
  new Request('https://bun.fixture/events'),
)
if (!(await streamResponse.text()).includes('"sequence":3')) {
  throw new Error('Bun server-stream conformanceに失敗しました')
}
await eventsBinding.application.close()
console.log('Bun 1.4 Stable conformance: 成功')
