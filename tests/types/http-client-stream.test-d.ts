import { contract } from '@loutrejs/loutre'
import { createHttpClient, http } from '@loutrejs/loutre/http'
import { z } from 'zod'
const Contract = contract([
  http({
    stream: {
      method: 'GET',
      path: '/stream',
      responses: {
        ok: {
          status: 200,
          stream: 'server',
          body: z.string().transform(Number),
        },
      },
      pipeline: [http.controller],
    },
  }),
])
const client = createHttpClient(Contract, async () => ({
  status: 200,
  body: (async function* () {
    yield '1'
  })(),
}))
async function consume() {
  const response = await client.stream()
  for await (const item of response.body) {
    const value: number = item
    void value
  }
}
void consume
