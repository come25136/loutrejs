import {
  createLambdaHttpDriver,
  createLambdaStreamingHttpDriver,
} from '@loutrejs/runtime-lambda'
import { createInvocationBinding } from '@loutrejs/application/binding'
import usersDefinition from '../dist/conformance/http-crud/application.mjs'
import eventsDefinition from '../dist/conformance/streaming-http/application.mjs'

if (!process.version.startsWith('v24.')) {
  throw new Error(`Lambda conformanceにはNode.js 24.xが必要です: ${process.version}`)
}

const usersBinding = createInvocationBinding(usersDefinition, process.env)
const eventsBinding = createInvocationBinding(eventsDefinition, process.env)
const unary = await createLambdaHttpDriver(usersBinding.http)({
  rawPath: '/users/lambda-user',
  requestContext: { http: { method: 'GET' } },
})
const body = JSON.parse(Buffer.from(unary.body, 'base64').toString('utf8'))
if (unary.statusCode !== 200 || body.id !== 'lambda-user') {
  throw new Error(`Lambda unary conformanceに失敗しました: ${JSON.stringify(body)}`)
}
await usersBinding.application.close()

const chunks = []
let ended = false
await createLambdaStreamingHttpDriver(eventsBinding.http)(
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
await eventsBinding.application.close()
console.log('AWS Lambda nodejs24.x conformance: 成功')
