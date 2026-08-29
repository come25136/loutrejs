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
import type {
  PackageManager,
  ProjectTarget,
} from '../packages/create-loutre/src/options.js'

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
        directory: 'My App',
        packageManager: 'npm',
        target: 'node',
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
          check: 'tsc --noEmit && loutre check --entry src/app.ts',
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
      expect(manifest.scripts.verify).not.toContain('npm run')
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
    } finally {
      await app.close('test-complete')
    }
  })

  it.each<{
    target: ProjectTarget
    entry: string
    script: string
  }>([
    {
      target: 'bun',
      entry: 'bunRuntime.serve',
      script: 'bun --watch src/main.ts',
    },
    {
      target: 'deno',
      entry: 'denoRuntime.serve',
      script: 'deno run -A --watch src/main.ts',
    },
    {
      target: 'cloudflare-workers',
      entry: 'cloudflareWorkersRuntime.bind',
      script: 'wrangler dev',
    },
    {
      target: 'aws-lambda',
      entry: 'awsLambdaRuntime.bind',
      script: 'esbuild src/main.ts',
    },
  ])(
    '$target向けentryとscriptを生成する',
    async ({ target, entry, script }) => {
      const app = bootstrap({ application })
      try {
        const result = await app.run(createProject, {
          cwd: root,
          directory: target,
          packageManager: 'pnpm',
          target,
        })
        const manifest = JSON.parse(
          await readFile(join(result.targetDirectory, 'package.json'), 'utf8'),
        )
        const main = await readFile(
          join(result.targetDirectory, 'src/main.ts'),
          'utf8',
        )

        expect(main).toContain(entry)
        expect(Object.values(manifest.scripts).join('\n')).toContain(script)
        expect(manifest.dependencies['@loutrejs/node']).toBeUndefined()

        if (target === 'cloudflare-workers') {
          const wrangler = await readFile(
            join(result.targetDirectory, 'wrangler.jsonc'),
            'utf8',
          )
          expect(wrangler).toContain('"name": "cloudflare-workers"')
          expect(manifest.scripts.deploy).toBe('wrangler deploy')
        }
        if (target === 'aws-lambda') {
          expect(manifest.devDependencies.esbuild).toBe('^0.28.2')
        }
      } finally {
        await app.close('test-complete')
      }
    },
  )

  it('空ではない生成先を上書きしない', async () => {
    const targetDirectory = join(root, 'existing')
    await mkdir(targetDirectory)
    await writeFile(join(targetDirectory, 'keep.txt'), 'keep', 'utf8')
    const app = bootstrap({ application })

    try {
      await expect(
        app.run(createProject, {
          cwd: root,
          directory: 'existing',
          packageManager: 'npm',
          target: 'node',
        }),
      ).rejects.toThrow('Target directory is not empty')
      expect(await readFile(join(targetDirectory, 'keep.txt'), 'utf8')).toBe(
        'keep',
      )
    } finally {
      await app.close('test-complete')
    }
  })

  it('--targetと--package-managerを非対話で指定できる', async () => {
    const output: string[] = []
    const io = createIO({
      install: async (_directory, packageManager) => {
        expect(packageManager).toBe('bun')
        return 0
      },
      stdout: (value) => output.push(value),
    })

    expect(
      await runCreateLoutre(
        ['demo', '--target', 'deno', '--package-manager', 'bun'],
        io,
      ),
    ).toBe(0)
    expect(output).toContain('Target: Deno')
    expect(output).toContain('Package manager: Bun')
    expect(output).toContain('  bun run dev')
  })

  it('対話時にtargetとpackage managerを選べる', async () => {
    const selected = ['cloudflare-workers', 'pnpm']
    const output: string[] = []
    const io = createIO({
      select: async () => selected.shift(),
      install: async (_directory, packageManager) => {
        expect(packageManager).toBe('pnpm')
        return 0
      },
      stdout: (value) => output.push(value),
    })

    expect(await runCreateLoutre(['demo'], io)).toBe(0)
    expect(output).toContain('Target: Cloudflare Workers')
    expect(output).toContain('Package manager: pnpm')
    expect(output).toContain('  pnpm run dev')
    expect(
      await readFile(join(root, 'demo', 'wrangler.jsonc'), 'utf8'),
    ).toContain('"main": "src/main.ts"')
  })

  it('--no-installなら選択したpackage managerでinstall案内だけ出す', async () => {
    let installed = false
    const output: string[] = []
    const io = createIO({
      install: async () => {
        installed = true
        return 0
      },
      stdout: (value) => output.push(value),
    })

    expect(
      await runCreateLoutre(
        [
          'demo',
          '--target',
          'bun',
          '--package-manager',
          'deno',
          '--no-install',
        ],
        io,
      ),
    ).toBe(0)
    expect(installed).toBe(false)
    expect(output).toContain('  deno install')
    expect(output).toContain('  deno task dev')
  })

  it('--yesなら既定targetと起動package managerを使う', async () => {
    const installs: Array<[string, PackageManager]> = []
    const io = createIO({
      detectedPackageManager: 'bun',
      install: async (directory, packageManager) => {
        installs.push([directory, packageManager])
        return 0
      },
    })

    expect(await runCreateLoutre(['-y'], io)).toBe(0)
    expect(installs).toEqual([[join(root, 'loutre-app'), 'bun']])
  })

  it('npmが渡す区切りの--を無視してoptionを解釈する', async () => {
    let installed = false
    const io = createIO({
      install: async () => {
        installed = true
        return 0
      },
    })

    expect(await runCreateLoutre(['demo', '--', '--no-install'], io)).toBe(0)
    expect(installed).toBe(false)
  })

  it('未知のoptionをCommanderのparse errorとして拒否する', async () => {
    const errors: string[] = []
    const io = createIO({ stderr: (value) => errors.push(value) })

    expect(await runCreateLoutre(['demo', '--unknown'], io)).toBe(2)
    expect(errors[0]).toContain("unknown option '--unknown'")
  })

  function createIO(
    overrides: Partial<CreateLoutreCliIO> = {},
  ): CreateLoutreCliIO {
    return {
      cwd: root,
      install: async () => 0,
      stdout: () => undefined,
      stderr: () => undefined,
      ...overrides,
    }
  }
})
