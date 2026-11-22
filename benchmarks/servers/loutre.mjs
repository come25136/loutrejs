import { application, env, module } from '@loutrejs/loutre'
import { nodeRuntime } from '@loutrejs/node'
import { z } from 'zod'
import { UsersModule } from '../../dist/integrations/http-crud/src/index.js'

const BenchmarkEnvSchema = z
  .object({
    BENCHMARK_PORT: z.coerce.number().int().min(1).max(65_535).default(43110),
  })
  .transform((values) => ({
    port: values.BENCHMARK_PORT,
  }))

class BenchmarkEnv extends env(BenchmarkEnvSchema) {}

const BenchmarkModule = module(() => ({
  environment: [BenchmarkEnv],
}))

const appDefinition = application({
  modules: [UsersModule(), BenchmarkModule()],
})
const app = await nodeRuntime.create({ application: appDefinition })
const listener = await app.serve({
  hostname: '127.0.0.1',
  port: app.get(BenchmarkEnv).port,
  shutdownHooks: false,
})

process.stdout.write(`BENCHMARK_READY http://127.0.0.1:${listener.port}\n`)

let closing = false
async function close(signal) {
  if (closing) return
  closing = true
  try {
    await app.close(signal)
    process.exitCode = 0
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  }
}

process.once('SIGINT', () => void close('SIGINT'))
process.once('SIGTERM', () => void close('SIGTERM'))
