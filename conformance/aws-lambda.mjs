import { awsLambdaRuntime } from '@loutrejs/loutre/runtime/aws-lambda'
import usersDefinition from '../dist/conformance/http-crud/application.mjs'
import eventsDefinition from '../dist/conformance/streaming-http/application.mjs'

const nodeMajorVersion = process.versions.node.split('.')[0]
process.env.AWS_EXECUTION_ENV ??= `AWS_Lambda_nodejs${nodeMajorVersion}.x`

const unaryHandler = awsLambdaRuntime.bind({ application: usersDefinition })
const unary = await unaryHandler({
  rawPath: '/users/aws-lambda-user',
  requestContext: { http: { method: 'GET' } },
})
const body = JSON.parse(Buffer.from(unary.body, 'base64').toString('utf8'))
if (unary.statusCode !== 200 || body.id !== 'aws-lambda-user') {
  throw new Error(
    `Lambda unary conformanceに失敗しました: ${JSON.stringify(body)}`,
  )
}

const streamingHandler = awsLambdaRuntime.bind({
  application: eventsDefinition,
  response: 'streaming',
})
const chunks = []
let ended = false
await streamingHandler(
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
console.log(`AWS Lambda Node.js ${process.versions.node} conformance: 成功`)
