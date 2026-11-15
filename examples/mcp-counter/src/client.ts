import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client'
import { endpoint } from './config.js'

const [name, args = '{}'] = process.argv.slice(2)
const token = process.env.MCP_TOKEN ?? 'demo-read'
const client = new Client(
  { name: 'counter-example', version: '1.0.0' },
  { versionNegotiation: { mode: { pin: '2026-07-28' } } },
)

try {
  await client.connect(
    new StreamableHTTPClientTransport(endpoint, {
      authProvider: { token: async () => token },
    }),
  )

  if (name === undefined) {
    const { tools } = await client.listTools()
    console.log(JSON.stringify(tools.map((tool) => tool.name)))
  } else {
    const result = await client.callTool({ name, arguments: JSON.parse(args) })
    console.log(JSON.stringify(result.structuredContent ?? result.content))
    if (result.isError) process.exitCode = 1
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
} finally {
  await client.close()
}
