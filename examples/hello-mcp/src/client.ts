import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client'
import { endpoint } from './config.js'

const client = new Client(
  { name: 'hello-mcp', version: '1.0.0' },
  { versionNegotiation: { mode: { pin: '2026-07-28' } } },
)

try {
  await client.connect(new StreamableHTTPClientTransport(endpoint))
  const { tools } = await client.listTools()
  console.log(JSON.stringify(tools.map((tool) => tool.name)))
  const result = await client.callTool({
    name: 'greet',
    arguments: { name: process.argv[2] ?? 'Loutre' },
  })
  console.log(JSON.stringify(result.structuredContent ?? result.content))
  if (result.isError) process.exitCode = 1
} finally {
  await client.close()
}
