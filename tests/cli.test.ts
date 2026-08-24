import { runCli } from '@loutrejs/cli'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
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
    expect(await runCli(['graph', 'contracts'], output.value)).toBe(0)
    expect(output.stdout.join('\n')).toContain('UsersContract.get [http]')
    expect(output.stdout.join('\n')).toContain('http.controller terminal')
  })

  it('Runtime capability mismatchをdoctorで説明する', async () => {
    const output = io()
    const code = await runCli(['doctor', 'electron'], output.value)
    expect(code).toBe(1)
    expect(output.stdout.join('\n')).toContain('Missing: http.server')
  })

  it('constructor dependencyをexplainする', async () => {
    const output = io()
    expect(await runCli(['explain', 'Service'], output.value)).toBe(0)
    expect(output.stdout.join('\n')).toContain('repository <- Repository')
  })

  it('Module description、lifecycle、exportsをGraphへ表示する', async () => {
    const output = io()
    expect(await runCli(['graph', 'modules'], output.value)).toBe(0)
    const graph = output.stdout.join('\n')
    expect(graph).toContain('DatabaseModule')
    expect(graph).toContain('description: `${args.name} database`')
    expect(graph).toContain('description: Database fixture application')
    expect(graph).toContain('lifecycle: onModuleInit')
    expect(graph).toContain('exports: args.provide')
  })

  it('Graphをmachine-readable JSONで出力する', async () => {
    const output = io()

    expect(await runCli([
      'graph',
      'contracts',
      '--format',
      'json',
    ], output.value)).toBe(0)

    const graph = JSON.parse(output.stdout.join('\n'))
    expect(graph.version).toBe(1)
    expect(graph.pipelines).toContainEqual(expect.objectContaining({
      contract: 'UsersContract',
      procedure: 'get',
      protocol: 'http',
    }))
  })

  it('GraphをDOTで出力する', async () => {
    const output = io()

    expect(await runCli([
      'graph',
      'di',
      '--format',
      'dot',
    ], output.value)).toBe(0)

    const graph = output.stdout.join('\n')
    expect(graph).toContain('digraph Loutre')
    expect(graph).toContain('"UsersController" -> "UsersService"')
  })

  it('複雑なtype-only importを持つRuntime Linkage Artifactをbuildして起動する', async () => {
    const output = io()
    const directory = await mkdtemp(join(tmpdir(), 'loutre-linkage-'))
    try {
      expect(await runCli([
        'build',
        'fixtures/compiler-manifest/src/runtime-linkage/app.ts',
        '--out-dir',
        directory,
      ], output.value)).toBe(0)
      const applicationPath = join(directory, 'application.mjs')
      const source = await readFile(applicationPath, 'utf8')
      expect(source).toContain('conditional-default-branch')
      expect(source).not.toContain('conditional-node-branch')
      expect(source).not.toContain('conditional-worker-branch')
      const built = await import(
        `${pathToFileURL(applicationPath).href}?test=${Date.now()}`
      )
      await expect(built.default.initialize()).resolves.toBeUndefined()
      await built.default.shutdown('test')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
