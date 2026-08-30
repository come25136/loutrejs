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
    '%sのgenerated Hostはstartup presentationの責務を持たない',
    async (target) => {
      const main = await generateMain(target)
      expect(main).toContain(`${target}Runtime.create({ application })`)
      expect(main).toContain('await app.serve()')
      expect(main).not.toContain('hostname')
      expect(main).not.toContain('127.0.0.1')
      expect(main).not.toContain('presentation')
      expect(main).not.toContain('renderStartupPrelude')
      expect(main).not.toContain('renderStartupStatus')
      expect(main).not.toContain('detectPresentationTerminal')
      expect(main).not.toContain('Loutre Application')
      expect(main).not.toContain('{{loutreVersion}}')
      expect(main).not.toContain('performance.now')
      expect(main).not.toContain('Runtime:')
      expect(main).not.toContain('Environment:')
      expect(main).not.toContain('SIGINT')
      expect(main).not.toContain('SIGTERM')
      expect(main).not.toContain('.close(')
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
