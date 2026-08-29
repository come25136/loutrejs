import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  runCreateLoutre,
  type CreateLoutreCliIO,
} from '../packages/create-loutre/src/cli.js'
import type { ProjectTarget } from '../packages/create-loutre/src/options.js'

describe('create-loutre startup presentation', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'create-loutre-presentation-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('TTYではproject promptより前にLoutre wordmarkを出力する', async () => {
    const output: string[] = []
    const io = createIO({
      terminal: { isTTY: true, color: false, columns: 120 },
      stdout: (value) => output.push(value),
    })

    expect(
      await runCreateLoutre(
        [
          'demo',
          '--target',
          'node',
          '--package-manager',
          'npm',
          '--no-install',
        ],
        io,
      ),
    ).toBe(0)
    expect(output[0]).toContain('██╗')
    expect(output[0]).toContain('ʕ•ᴥ•ʔ Loutre')
  })

  it.each<ProjectTarget>(['node', 'bun', 'deno'])(
    '%sのgenerated Hostはstartup prelude -> serve -> startup statusの順になる',
    async (target) => {
      const main = await generateMain(target)
      const prelude = main.indexOf(
        'renderStartupPrelude(startup, presentation)',
      )
      const serve = main.indexOf(`${target}Runtime.serve`)
      const status = main.indexOf('renderStartupStatus(')

      expect(prelude).toBeGreaterThanOrEqual(0)
      expect(serve).toBeGreaterThan(prelude)
      expect(status).toBeGreaterThan(serve)
      expect(main.slice(prelude, status)).toContain(
        `await ${target}Runtime.serve`,
      )
      expect(main.match(/renderStartupStatus\(/g)).toHaveLength(1)
      expect(main).toContain("application: 'Loutre Application'")
      expect(main).toContain("version: '0.1.0'")
      expect(main).not.toContain('typed · modular · fast')
    },
  )

  it.each<ProjectTarget>(['node', 'bun', 'deno'])(
    '%sのgenerated Hostはserve失敗時にReady描画へ到達しない制御フローを生成する',
    async (target) => {
      const main = await generateMain(target)
      const serveStatement = `await ${target}Runtime.serve`
      const serve = main.indexOf(serveStatement)
      const ready = main.indexOf('renderStartupStatus(', serve)

      expect(serve).toBeGreaterThanOrEqual(0)
      expect(ready).toBeGreaterThan(serve)
      expect(main.slice(serve, ready)).not.toContain('catch')
      expect(main.slice(serve, ready)).not.toContain('finally')
    },
  )

  it.each<ProjectTarget>(['cloudflare-workers', 'aws-lambda'])(
    '%sのgenerated Hostはprocess startup presentationを自動表示しない',
    async (target) => {
      const main = await generateMain(target)
      expect(main).not.toContain('renderStartupPrelude')
      expect(main).not.toContain('renderStartupStatus')
    },
  )

  async function generateMain(target: ProjectTarget): Promise<string> {
    const io = createIO()
    expect(
      await runCreateLoutre(
        [
          target,
          '--target',
          target,
          '--package-manager',
          'npm',
          '--no-install',
        ],
        io,
      ),
    ).toBe(0)
    return readFile(join(root, target, 'src/main.ts'), 'utf8')
  }

  function createIO(
    overrides: Partial<CreateLoutreCliIO> = {},
  ): CreateLoutreCliIO {
    return {
      cwd: root,
      terminal: { isTTY: false, color: false },
      install: async () => 0,
      stdout: () => undefined,
      stderr: () => undefined,
      ...overrides,
    }
  }
})
