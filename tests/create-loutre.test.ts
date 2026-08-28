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
          build: 'tsc -p tsconfig.build.json',
          start: 'node dist/main.js',
          typecheck: 'tsc --noEmit',
          check: 'npm run typecheck && loutre check --entry src/app.ts',
          test: 'vitest run',
          lint: 'oxlint',
          format: 'oxfmt',
          'format:check': 'oxfmt --check',
        },
        dependencies: {
          '@loutrejs/loutre': '^0.1.0',
          '@loutrejs/node': '^0.1.0',
        },
        devDependencies: {
          '@loutrejs/cli': '^0.1.0',
          oxfmt: '^0.65.0',
          oxlint: '^1.80.0',
          vitest: '^4.1.11',
        },
      })
      expect(
        await readFile(join(result.targetDirectory, 'src/app.ts'), 'utf8'),
      ).toContain("path: '/'")
      expect(
        await readFile(join(result.targetDirectory, 'src/main.ts'), 'utf8'),
      ).toContain('nodeRuntime.serve')
      expect(
        await readFile(join(result.targetDirectory, 'src/app.test.ts'), 'utf8'),
      ).toContain('GET / がLoutre Applicationのレスポンスを返す')
      expect(
        await readFile(join(result.targetDirectory, '.oxlintrc.json'), 'utf8'),
      ).toContain('correctness')
      expect(
        await readFile(join(result.targetDirectory, '.oxfmtrc.json'), 'utf8'),
      ).toContain('singleQuote')
      expect(
        await readFile(
          join(result.targetDirectory, 'vitest.config.ts'),
          'utf8',
        ),
      ).toContain('src/**/*.test.ts')
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

    expect(await runCreateLoutre(['-y'], io)).toBe(0)
    expect(installs).toEqual([join(root, 'loutre-app')])
  })

  it('npmが渡す区切りの--を無視してoptionを解釈する', async () => {
    let installed = false
    const io: CreateLoutreCliIO = {
      cwd: root,
      install: async () => {
        installed = true
        return 0
      },
      stdout: () => undefined,
      stderr: () => undefined,
    }

    expect(await runCreateLoutre(['demo', '--', '--no-install'], io)).toBe(0)
    expect(installed).toBe(false)
  })

  it('未知のoptionをCommanderのparse errorとして拒否する', async () => {
    const errors: string[] = []
    const io: CreateLoutreCliIO = {
      cwd: root,
      install: async () => 0,
      stdout: () => undefined,
      stderr: (value) => errors.push(value),
    }

    expect(await runCreateLoutre(['demo', '--unknown'], io)).toBe(2)
    expect(errors[0]).toContain("unknown option '--unknown'")
  })
})
