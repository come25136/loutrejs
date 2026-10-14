import { spawn } from 'node:child_process'

const workerSource = `
import { defineApplication, defineModule } from '@loutrejs/loutre'
import { fixedDelay, task } from '@loutrejs/loutre/tasks'
import { nodeRuntime } from '@loutrejs/node'

class Resource {
  async onApplicationShutdown(signal) {
    await new Promise(resolve => setTimeout(resolve, 10))
    console.log('SHUTDOWN:' + signal)
  }
}
const tick = task({
  name: 'tick',
  factory: () => async () => console.log('TICK'),
})
const trigger = fixedDelay({ name: 'poll', delay: 20, immediate: true, task: tick })
const module = defineModule(() => ({ providers: [Resource], executions: [trigger] }))()
const app = await nodeRuntime.create({ application: defineApplication({ modules: [module] }) })
await app.tasks.start()
console.log('READY')
`

describe('Node workerのprocess signal', () => {
  it.each(['SIGINT', 'SIGTERM'] as const)(
    '%sでTaskを停止し、終了lifecycle完了後に正常終了する',
    async (signal) => {
      const child = spawn(
        process.execPath,
        ['--input-type=module', '--eval', workerSource],
        {
          cwd: process.cwd(),
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      )
      let output = ''
      child.stdout.on('data', (chunk) => {
        output += String(chunk)
      })
      child.stderr.on('data', (chunk) => {
        output += String(chunk)
      })
      const exited = new Promise<{
        code: number | null
        signal: NodeJS.Signals | null
      }>((resolve, reject) => {
        child.once('error', reject)
        child.once('close', (code, exitSignal) =>
          resolve({ code, signal: exitSignal }),
        )
      })
      try {
        await vi.waitFor(() => expect(output).toContain('READY'), {
          timeout: 10_000,
        })
        expect(child.kill(signal)).toBe(true)
        await vi.waitFor(
          () => expect(child.exitCode ?? child.signalCode).not.toBeNull(),
          { timeout: 10_000 },
        )
        expect(await exited).toEqual({ code: 0, signal: null })
        expect(output).toContain('TICK')
        expect(output.match(/SHUTDOWN:/g)).toHaveLength(1)
        expect(output).toContain(`SHUTDOWN:${signal}`)
        expect(output.slice(output.indexOf('SHUTDOWN:'))).not.toContain('TICK')
      } finally {
        if (child.exitCode === null && child.signalCode === null)
          child.kill('SIGKILL')
        await exited
      }
    },
  )
})
