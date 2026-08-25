import { runCli } from '@loutrejs/cli'
import application from '../examples/database-transactions/src/app.js'
import { resolve } from 'node:path'

describe('Database example', () => {
  it('DB不要exampleを実際のHTTP applicationとして実行できる', async () => {
    await application.initialize()
    try {
      const response = await application.handle(new Request(
        'http://database-example.test/users',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'Loutre' }),
        },
      ))

      expect(response.status).toBe(201)
      expect(await response.json()).toEqual(expect.objectContaining({
        name: 'Loutre',
        createdBy: 'demo-user',
      }))
    } finally {
      await application.shutdown('test')
    }
  })

  it('全Database exampleをDB接続なしでGraph compileできる', async () => {
    const examples = [
      'database-transactions',
      'database-postgres',
      'database-drizzle-postgres',
      'database-prisma-postgres',
    ] as const

    for (const directory of examples) {
      const stdout: string[] = []
      const stderr: string[] = []
      const code = await runCli(
        ['check', '--entry', 'src/app.ts'],
        {
          cwd: resolve(import.meta.dirname, `../examples/${directory}`),
          stdout: (value) => { stdout.push(value) },
          stderr: (value) => { stderr.push(value) },
        },
      )
      expect(code, directory).toBe(0)
      expect(stderr, directory).toEqual([])
      expect(stdout, directory).toContain('Loutre Application Graphは有効です。')
    }
  }, 30_000)
})
