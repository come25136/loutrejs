import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  runCreateLoutre,
  type CreateLoutreCliIO,
} from '../packages/create-loutre/src/cli.js'
import type { ProjectTarget } from '../packages/create-loutre/src/options.js'

describe('create-loutre startup banner', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'create-loutre-banner-'))
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

  it.each<{
    target: ProjectTarget
    marker: string
  }>([
    { target: 'node', marker: 'printStartupBanner' },
    { target: 'bun', marker: 'printStartupBanner' },
    { target: 'deno', marker: 'renderStartupBanner' },
  ])('$targetのgenerated Hostがstartup bannerを描画する', async ({ target, marker }) => {
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

    const main = await readFile(join(root, target, 'src/main.ts'), 'utf8')
    expect(main).toContain(marker)
    expect(main).toContain("application: 'Loutre Application'")
  })

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
