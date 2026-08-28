import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bootstrap } from '@loutrejs/loutre/host'
import application, {
  createProject,
} from '../packages/create-loutre/src/app.js'
import {
  runCreateLoutre,
  type CreateLoutreCliIO,
} from '../packages/create-loutre/src/cli.js'

describe('create-loutre', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'create-loutre-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('Loutre TaskとしてNode.js HTTP Applicationを生成する', async () => {
    const app = bootstrap({ application })
    try {
      const result = await app.run(createProject, {
        cwd: root,
        target: 'My App',
      })

      expect(result.packageName).toBe('my-app')
      const manifest = JSON.parse(
        await readFile(join(result.targetDirectory, 'package.json'), 'utf8'),
      )
      expect(manifest).toMatchObject({
        name: 'my-app',
        type: 'module',
        scripts: {
          dev: 'tsx watch src/main.ts',
          build: 'tsc',
          start: 'node dist/main.js',
          check: 'tsc --noEmit && loutre check --entry src/app.ts',
        },
        dependencies: {
          '@loutrejs/loutre': '^0.1.0',
          '@loutrejs/node': '^0.1.0',
        },
      })
      expect(
        await readFile(join(result.targetDirectory, 'src/app.ts'), 'utf8'),
      ).toContain("path: '/'")
      expect(
        await readFile(join(result.targetDirectory, 'src/main.ts'), 'utf8'),
      ).toContain('nodeRuntime.serve')
    } finally {
      await app.close('test-complete')
    }
  })

  it('空ではない生成先を上書きしない', async () => {
    const target = join(root, 'existing')
    await mkdir(target)
    await writeFile(join(target, 'keep.txt'), 'keep', 'utf8')
    const app = bootstrap({ application })

    try {
      await expect(
        app.run(createProject, { cwd: root, target: 'existing' }),
      ).rejects.toThrow('生成先が空ではありません')
      expect(await readFile(join(target, 'keep.txt'), 'utf8')).toBe('keep')
    } finally {
      await app.close('test-complete')
    }
  })

  it('--no-installなら依存installをHostから呼ばない', async () => {
    let installed = false
    const output: string[] = []
    const io: CreateLoutreCliIO = {
      cwd: root,
      install: async () => {
        installed = true
        return 0
      },
      stdout: (value) => output.push(value),
      stderr: (value) => output.push(value),
    }

    expect(await runCreateLoutre(['demo', '--no-install'], io)).toBe(0)
    expect(installed).toBe(false)
    expect(output).toContain('  npm install')
    expect(output).toContain('  npm run dev')
  })

  it('--yesなら非対話環境でも既定の生成先を使う', async () => {
    const installs: string[] = []
    const io: CreateLoutreCliIO = {
      cwd: root,
      install: async (directory) => {
        installs.push(directory)
        return 0
      },
      stdout: () => undefined,
      stderr: () => undefined,
    }

    expect(await runCreateLoutre(['--yes'], io)).toBe(0)
    expect(installs).toEqual([join(root, 'loutre-app')])
  })
})
