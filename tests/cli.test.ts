import { bootstrap } from '@loutrejs/loutre/host'
import { runCli } from '@loutrejs/cli'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

describe('Loutre CLI', () => {
  function io() {
    const stdout: string[] = []
    const stderr: string[] = []
    return {
      stdout,
      stderr,
      value: {
        cwd: process.cwd(),
        stdout: (message: string) => stdout.push(message),
        stderr: (message: string) => stderr.push(message),
      },
    }
  }

  it('Contract/Pipeline Graphを表示する', async () => {
    const output = io()
    expect(
      await runCli(
        ['graph', 'contracts', '--entry', 'fixtures/http-crud/src/app.ts'],
        output.value,
      ),
    ).toBe(0)
    expect(output.stdout.join('\n')).toContain('UsersContract.get [http]')
    expect(output.stdout.join('\n')).toContain('http.controller terminal')
  })

  it('Runtime capability mismatchをdoctorで説明する', async () => {
    const output = io()
    const code = await runCli(
      ['doctor', 'electron', '--entry', 'fixtures/http-crud/src/app.ts'],
      output.value,
    )
    expect(code).toBe(1)
    expect(output.stdout.join('\n')).toContain('Missing: http.server')
  })

  it('constructor dependencyをexplainする', async () => {
    const output = io()
    expect(
      await runCli(
        [
          'explain',
          'UsersController',
          '--entry',
          'fixtures/http-crud/src/app.ts',
        ],
        output.value,
      ),
    ).toBe(0)
    expect(output.stdout.join('\n')).toContain('UsersService')
  })

  it('Module descriptionをGraphへ表示する', async () => {
    const output = io()
    expect(
      await runCli(
        ['graph', 'modules', '--entry', 'fixtures/http-crud/src/app.ts'],
        output.value,
      ),
    ).toBe(0)
    const graph = output.stdout.join('\n')
    expect(graph).toContain('UsersModule')
    expect(graph).toContain('module:1')
    expect(graph).toContain('description: Canonical HTTP CRUD fixture')
  })

  it('Graphをmachine-readable JSONで出力する', async () => {
    const output = io()
    expect(
      await runCli(
        [
          'graph',
          'contracts',
          '--format',
          'json',
          '--entry',
          'fixtures/http-crud/src/app.ts',
        ],
        output.value,
      ),
    ).toBe(0)
    const graph = JSON.parse(output.stdout.join('\n'))
    expect(graph).not.toHaveProperty('version')
    expect(graph.pipelines).toContainEqual(
      expect.objectContaining({
        contract: 'UsersContract',
        procedure: 'get',
        protocol: 'http',
      }),
    )
  })

  it('execution rootをGraphから表示する', async () => {
    const output = io()
    expect(
      await runCli(
        ['graph', 'executions', '--entry', 'fixtures/http-crud/src/app.ts'],
        output.value,
      ),
    ).toBe(0)
    expect(output.stdout.join('\n')).toContain(
      'protocol: protocol:http:UsersContract.get',
    )
  })

  it('GraphをMermaidで出力する', async () => {
    const output = io()
    expect(
      await runCli(
        [
          'graph',
          'di',
          '--format',
          'mermaid',
          '--entry',
          'fixtures/http-crud/src/app.ts',
        ],
        output.value,
      ),
    ).toBe(0)
    const graph = output.stdout.join('\n')
    expect(graph).toContain('flowchart LR')
    expect(graph).toContain('UsersController [implementation, application]')
    expect(graph).toContain('UsersService [class, application]')
    expect(graph).toContain('inject/probed')
  })

  it('Module名をMermaid nodeへ出力する', async () => {
    const output = io()
    expect(
      await runCli(
        [
          'graph',
          'modules',
          '--format',
          'mermaid',
          '--entry',
          'fixtures/http-crud/src/app.ts',
        ],
        output.value,
      ),
    ).toBe(0)
    expect(output.stdout.join('\n')).toContain('m0["UsersModule"]')
  })

  it('DOT formatを受け付けない', async () => {
    const output = io()
    expect(
      await runCli(
        [
          'graph',
          'modules',
          '--format',
          'dot',
          '--entry',
          'fixtures/http-crud/src/app.ts',
        ],
        output.value,
      ),
    ).toBe(2)
    expect(output.stderr.join('\n')).toContain('text, json, mermaid')
  })

  it('broken DIでもpartial graphとdiagnosticを返す', async () => {
    const output = io()
    expect(
      await runCli(
        ['graph', 'di', '--entry', 'fixtures/graph-probe/src/app.ts'],
        output.value,
      ),
    ).toBe(1)
    expect(output.stdout.join('\n')).toContain('BrokenStorage')
    expect(output.stdout.join('\n')).toContain('UNRESOLVED')
    expect(output.stderr.join('\n')).toContain('LUTRE_DI_UNRESOLVED')
  })

  it('Application host commandは提供しない', async () => {
    for (const command of ['run', 'dev', 'start']) {
      const output = io()
      expect(await runCli([command, 'src/app.ts'], output.value)).toBe(2)
      expect(output.stderr).toEqual([`Unknown command: ${command}`])
    }
  })

  it('複雑なimportを持つApplicationをCompiler linkageなしでbuildする', async () => {
    const output = io()
    const directory = await mkdtemp(join(tmpdir(), 'loutre-linkage-'))
    try {
      expect(
        await runCli(
          [
            'build',
            'fixtures/application-build/src/app.ts',
            '--out-dir',
            directory,
          ],
          output.value,
        ),
      ).toBe(0)
      const applicationPath = join(directory, 'application.mjs')
      expect(await readdir(directory)).toEqual(['application.mjs'])
      const source = await readFile(applicationPath, 'utf8')
      expect(source).toContain('conditional-default-branch')
      expect(source).not.toContain('conditional-node-branch')
      expect(source).not.toContain('conditional-worker-branch')
      const built = await import(
        `${pathToFileURL(applicationPath).href}?test=${Date.now()}`
      )
      expect(built.default.kind).toBe('application-definition')
      const application = bootstrap({ application: built.default })
      await expect(application.init()).resolves.toBe(application)
      await application.close()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it.each([
    [
      'aws-lambda',
      "import { awsLambdaRuntime } from '@loutrejs/loutre/runtime/aws-lambda'",
      'export const handler = awsLambdaRuntime.bind({ application })',
    ],
    [
      'cloudflare-workers',
      "import { cloudflareWorkersRuntime } from '@loutrejs/loutre/runtime/cloudflare-workers'",
      'export default cloudflareWorkersRuntime.bind({ application })',
    ],
    [
      'deno',
      "import { denoRuntime } from '@loutrejs/loutre/runtime/deno'",
      'export default denoRuntime.bind({ application })',
    ],
  ])(
    'build --runtime %sでdeployment entryを生成する',
    async (runtime, runtimeImport, runtimeExport) => {
      const output = io()
      const directory = await mkdtemp(join(tmpdir(), `loutre-${runtime}-`))
      try {
        expect(
          await runCli(
            [
              'build',
              'fixtures/http-crud/src/app.ts',
              '--runtime',
              runtime,
              '--out-dir',
              directory,
            ],
            output.value,
          ),
        ).toBe(0)
        const source = await readFile(join(directory, 'entry.mjs'), 'utf8')
        expect(source).toContain("import application from './application.mjs'")
        expect(source).toContain(runtimeImport)
        expect(source).toContain(runtimeExport)
        expect(output.stdout.join('\n')).toContain('Wrote runtime entry:')
      } finally {
        await rm(directory, { recursive: true, force: true })
      }
    },
  )

  it('build --runtimeはdeployment entryを必要とするruntimeだけ受け付ける', async () => {
    const output = io()
    expect(
      await runCli(
        ['build', 'fixtures/http-crud/src/app.ts', '--runtime', 'node'],
        output.value,
      ),
    ).toBe(2)
    expect(output.stderr.join('\n')).toContain(
      'build --runtime must be one of: aws-lambda, cloudflare-workers, deno.',
    )
  })
})
