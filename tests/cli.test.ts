import { runCli } from '@loutrejs/cli'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { bootstrap } from '@loutrejs/application/host'

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
    expect(graph.version).toBe(3)
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
    expect(output.stderr.join('\n')).toContain('text、json、mermaid')
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

  it('複雑なimportを持つApplicationをCompiler linkageなしでbuildして起動する', async () => {
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
      const source = await readFile(applicationPath, 'utf8')
      expect(source).toContain('conditional-default-branch')
      expect(source).not.toContain('conditional-node-branch')
      expect(source).not.toContain('conditional-worker-branch')
      const built = await import(
        `${pathToFileURL(applicationPath).href}?test=${Date.now()}`
      )
      expect(built.default.kind).toBe('application-definition')
      const application = bootstrap(built.default)
      await expect(application.init()).resolves.toBe(application)
      await application.close()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
