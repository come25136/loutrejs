import { application, module } from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { mcp } from '@loutrejs/mcp'
import { z } from 'zod'
import { mcpPath } from './config.js'

const ApiContract = http.contract({
  mcp: { raw: true, method: '*', path: mcpPath },
})

const GreetingContract = mcp.contract({
  greet: {
    description: '名前を指定して挨拶する',
    scopes: [],
    input: z.object({ name: z.string().min(1) }),
    output: z.object({ message: z.string() }),
  },
})

const greetingEndpoint = mcp.implementation({
  name: 'greeting',
  version: '1.0.0',
  route: ApiContract.routes.mcp,
  contract: GreetingContract,
  factory: () => ({
    tools: {
      greet: ({ input }) => ({ message: `Hello, ${input.name}!` }),
    },
  }),
})

export default application({
  modules: [module({ executions: [greetingEndpoint] })],
})
