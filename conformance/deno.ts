import { denoRuntime } from '@loutrejs/runtime-deno'
import usersDefinition from '../dist/conformance/http-crud/application.mjs'
import eventsDefinition from '../dist/conformance/streaming-http/application.mjs'

const users = denoRuntime.bind({ application: usersDefinition })
const events = denoRuntime.bind({ application: eventsDefinition })
const response = await users.fetch(
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

const streamResponse = await events.fetch(
  new Request('https://deno.fixture/events'),
)
if (!(await streamResponse.text()).includes('"sequence":3')) {
  throw new Error('Deno server-stream conformanceに失敗しました')
}
await users.close()
await events.close()
console.log('Deno 2.9 LTS conformance: 成功')
