import { bunRuntime } from '@loutrejs/runtime-bun'
import usersDefinition from '../dist/conformance/http-crud/application.mjs'
import eventsDefinition from '../dist/conformance/streaming-http/application.mjs'

const port = 28743
const users = await bunRuntime.serve({ application: usersDefinition, port })
try {
  const response = await fetch(`http://127.0.0.1:${port}/users/bun-user`)
  const body = (await response.json()) as {
    readonly id?: string
    readonly name?: string
  }
  if (response.status !== 200 || body.id !== 'bun-user' || body.name !== 'test') {
    throw new Error(`Bun conformanceに失敗しました: ${JSON.stringify(body)}`)
  }
} finally {
  await users.close()
}

const events = await bunRuntime.serve({ application: eventsDefinition, port })
try {
  const streamResponse = await fetch(`http://127.0.0.1:${port}/events`)
  if (!(await streamResponse.text()).includes('"sequence":3')) {
    throw new Error('Bun server-stream conformanceに失敗しました')
  }
} finally {
  await events.close()
}
console.log('Bun 1.4 Stable conformance: 成功')
