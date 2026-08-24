import {
  createLambdaHandler,
  createLambdaStreamingHandler,
} from '@loutrefw/runtime-lambda'
import { createUsersApplication } from '../fixtures/http-crud/src/index.js'
import { createEventsApplication } from '../fixtures/streaming/src/index.js'

if (!process.version.startsWith('v24.')) {
  throw new Error(`Lambda conformanceにはNode.js 24.xが必要です: ${process.version}`)
}

const users = createUsersApplication()
const unary = await createLambdaHandler(users)({
  rawPath: '/users/lambda-user',
  requestContext: { http: { method: 'GET' } },
})
const body = JSON.parse(Buffer.from(unary.body, 'base64').toString('utf8'))
if (unary.statusCode !== 200 || body.id !== 'lambda-user') {
  throw new Error(`Lambda unary conformanceに失敗しました: ${JSON.stringify(body)}`)
}
await users.shutdown('conformance')

const events = createEventsApplication()
const chunks: Uint8Array[] = []
let ended = false
await createLambdaStreamingHandler(events)(
  {
    rawPath: '/events',
    requestContext: { http: { method: 'GET' } },
  },
  {
    write: (chunk) => {
      chunks.push(chunk)
      return true
    },
    end: () => {
      ended = true
    },
  },
)
const streamed = new TextDecoder().decode(Buffer.concat(chunks))
if (!ended || !streamed.includes('"sequence":3')) {
  throw new Error('Lambda response streaming conformanceに失敗しました')
}
await events.shutdown('conformance')
console.log('AWS Lambda nodejs24.x conformance: 成功')
