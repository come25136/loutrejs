import { createKernelApplication } from '@loutrejs/loutre'
import { bootstrapApplication } from '@loutrejs/loutre'
import { bindHttpServer } from '@loutrejs/loutre/http'
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
        ['graph', 'contracts', '--entry', 'integrations/http-crud/src/app.ts'],
        output.value,
      ),
    ).toBe(0)
    expect(output.stdout.join('\n')).toContain('UsersController.get [http]')
    expect(output.stdout.join('\n')).toContain('GET /users/{id}')
  })

  it.each([
    ['Node.js', undefined, 'node'],
    ['Bun', { Bun: { version: '1.3.7' } }, 'bun'],
    ['Deno', { Deno: { version: { deno: '2.9.6' } } }, 'deno'],
  ])(
    'doctorでruntimeを省略すると実行中の%sを使用する',
    async (_runtime, globals, expected) => {
      if (globals) {
        for (const [name, value] of Object.entries(globals)) {
          vi.stubGlobal(name, value)
        }
      }
      try {
        const output = io()
        const code = await runCli(
          ['doctor', '--entry', 'integrations/http-crud/src/app.ts'],
          output.value,
        )
        expect(code).toBe(0)
        expect(output.stdout.join('\n')).toContain(`Runtime: ${expected}`)
      } finally {
        vi.unstubAllGlobals()
      }
    },
  )

  it('doctor --runtimeは既知のruntimeだけ受け付ける', async () => {
    const output = io()
    expect(
      await runCli(
        [
          'doctor',
          '--runtime',
          'unknown-runtime',
          '--entry',
          'integrations/http-crud/src/app.ts',
        ],
        output.value,
      ),
    ).toBe(2)
    expect(output.stderr).toEqual([
      'doctor --runtime must be one of: node, deno, bun, cloudflare-workers, electron, aws-lambda.',
    ])
  })

  it('Runtime capability mismatchをdoctorで説明する', async () => {
    const output = io()
    const code = await runCli(
      [
        'doctor',
        '--runtime',
        'electron',
        '--entry',
        'integrations/http-crud/src/app.ts',
      ],
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
          'integrations/http-crud/src/app.ts',
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
        ['graph', 'modules', '--entry', 'integrations/http-crud/src/app.ts'],
        output.value,
      ),
    ).toBe(0)
    const graph = output.stdout.join('\n')
    expect(graph).toContain('UsersModule')
    expect(graph).toContain('module:1')
    expect(graph).toContain('description: HTTP CRUD integration')
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
          'integrations/http-crud/src/app.ts',
        ],
        output.value,
      ),
    ).toBe(0)
    const graph = JSON.parse(output.stdout.join('\n'))
    expect(graph).not.toHaveProperty('version')
    expect(graph.executions).toContainEqual(
      expect.objectContaining({
        id: 'UsersController',
        executionKind: 'http.request',
        capabilities: expect.arrayContaining(['http.server']),
      }),
    )
    expect(graph.routes).toContainEqual(
      expect.objectContaining({
        execution: 'UsersController',
        name: 'get',
        method: 'GET',
        path: '/users/{id}',
      }),
    )
  })

  it('execution rootをGraphから表示する', async () => {
    const output = io()
    expect(
      await runCli(
        ['graph', 'executions', '--entry', 'integrations/http-crud/src/app.ts'],
        output.value,
      ),
    ).toBe(0)
    expect(output.stdout.join('\n')).toContain('http.request: UsersController')
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
          'integrations/http-crud/src/app.ts',
        ],
        output.value,
      ),
    ).toBe(0)
    const graph = output.stdout.join('\n')
    expect(graph).toContain('flowchart LR')
    expect(graph).toContain('UsersController')
    expect(graph).toContain('UsersService')
    expect(graph).toContain('injects')
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
          'integrations/http-crud/src/app.ts',
        ],
        output.value,
      ),
    ).toBe(0)
    expect(output.stdout.join('\n')).toContain('n0["UsersModule"]')
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
          'integrations/http-crud/src/app.ts',
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
        ['graph', 'di', '--entry', 'integrations/graph-probe/src/app.ts'],
        output.value,
      ),
    ).toBe(1)
    expect(output.stdout.join('\n')).toContain('graph-probe.storage')
    expect(output.stderr.join('\n')).toContain(
      'LUTRE_PROVIDER_DEPENDENCY_MISSING',
    )
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
            'integrations/application-build/src/app.ts',
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
      const application = await bootstrapApplication({
        application: built.default,
      })
      await application.close()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('bundle済みApplication ModelとHost側Capability identityを共有する', async () => {
    const output = io()
    const directory = await mkdtemp(join(tmpdir(), 'loutre-bundle-capability-'))
    try {
      expect(
        await runCli(
          ['build', 'examples/hello-http/src/app.ts', '--out-dir', directory],
          output.value,
        ),
      ).toBe(0)
      const built = await import(
        `${pathToFileURL(join(directory, 'application.mjs')).href}?test=${Date.now()}`
      )
      const application = createKernelApplication({
        application: built.default,
        capabilities: [bindHttpServer({ runtime: 'bundle-test' })],
        environment: {},
      })
      await application.init()
      try {
        const response = await (
          application as unknown as {
            readonly http: { fetch(request: Request): Promise<Response> }
          }
        ).http.fetch(new Request('https://fixture.test/Loutre'))
        expect(response.status).toBe(200)
        await expect(response.json()).resolves.toEqual({
          message: 'Hello, Loutre!',
        })
      } finally {
        await application.close()
      }
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
              'integrations/http-crud/src/app.ts',
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
        ['build', 'integrations/http-crud/src/app.ts', '--runtime', 'node'],
        output.value,
      ),
    ).toBe(2)
    expect(output.stderr.join('\n')).toContain(
      'build --runtime must be one of: aws-lambda, cloudflare-workers, deno.',
    )
  })
})
