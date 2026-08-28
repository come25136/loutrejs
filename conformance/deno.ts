import { createInvocationBinding } from '@loutrejs/application/binding'
import { createDenoFetchDriver } from '@loutrejs/runtime-deno'
import usersDefinition from '../dist/conformance/http-crud/application.mjs'
import eventsDefinition from '../dist/conformance/streaming-http/application.mjs'

const usersBinding = createInvocationBinding({ application: usersDefinition })
const eventsBinding = createInvocationBinding({ application: eventsDefinition })
const handler = createDenoFetchDriver(usersBinding.http!)
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
await usersBinding.application.close()

const streamResponse = await createDenoFetchDriver(eventsBinding.http!)(
  new Request('https://deno.fixture/events'),
)
if (!(await streamResponse.text()).includes('"sequence":3')) {
  throw new Error('Deno server-stream conformanceに失敗しました')
}
await eventsBinding.application.close()
console.log('Deno 2.9 LTS conformance: 成功')
