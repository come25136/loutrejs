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

  function graphLine(output: ReturnType<typeof io>, fragment: string): string {
    return (
      output.stdout
        .join('\n')
        .split('\n')
        .find((line) => line.includes(fragment)) ?? ''
    )
  }

  it('HTTP Execution Graphを表示する', async () => {
    const output = io()
    expect(
      await runCli(
        ['graph', 'http', '--entry', 'integrations/http-crud/src/app.ts'],
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
          'http',
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
        middlewares: [],
      }),
    )
    expect(graph.routes).toContainEqual(
      expect.objectContaining({
        execution: 'UsersController',
        name: 'create',
        middlewares: [{ name: 'validate.body', capabilities: [] }],
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
    expect(output.stdout.join('\n')).toContain('n0["Module: UsersModule"]')
  })

  it('graph allはApplication Model全体を意味的に接続したJSONを返す', async () => {
    const output = io()
    expect(
      await runCli(
        [
          'graph',
          'all',
          '--format',
          'json',
          '--entry',
          'integrations/http-crud/src/app.ts',
        ],
        output.value,
      ),
    ).toBe(0)

    const graph = JSON.parse(output.stdout.join('\n'))
    const node = (kind: string, label: string) =>
      graph.nodes.find(
        (candidate: { kind: string; label: string }) =>
          candidate.kind === kind && candidate.label === label,
      )
    const module = node('module', 'UsersModule')
    const service = node('provider', 'UsersService')
    const controller = node('execution', 'UsersController')
    const capability = node('runtime-capability', 'http.server')
    const getRoute = node('entrypoint', 'GET /users/{id}')
    const createRoute = node('entrypoint', 'POST /users')
    const bodyValidation = node('middleware', 'validate.body')
    const getHandler = node('handler', 'UsersController.get')
    const createHandler = node('handler', 'UsersController.create')

    expect(module).toBeDefined()
    expect(service).toBeDefined()
    expect(controller).toMatchObject({
      id: 'UsersController',
      executionKind: 'http.request',
      capabilities: expect.arrayContaining(['http.server']),
    })
    expect(capability).toBeDefined()
    expect(getRoute).toMatchObject({ entrypointKind: 'http-route' })
    expect(createRoute).toMatchObject({ entrypointKind: 'http-route' })
    expect(bodyValidation).toMatchObject({
      attributes: { route: 'create', index: 0 },
    })
    expect(getHandler).toBeDefined()
    expect(createHandler).toBeDefined()
    expect(
      graph.nodes.filter(
        (candidate: { kind: string; label: string }) =>
          candidate.kind === 'execution' &&
          candidate.label === 'UsersController',
      ),
    ).toHaveLength(1)

    expect(graph.edges).toContainEqual({
      from: module.id,
      to: service.id,
      kind: 'owns',
    })
    expect(graph.edges).toContainEqual({
      from: module.id,
      to: controller.id,
      kind: 'owns',
    })
    expect(graph.edges).toContainEqual({
      from: controller.id,
      to: service.id,
      kind: 'injects',
    })
    expect(graph.edges).toContainEqual({
      from: controller.id,
      to: capability.id,
      kind: 'requires',
    })
    expect(graph.edges).toContainEqual({
      from: controller.id,
      to: getRoute.id,
      kind: 'handles',
      label: 'get',
    })
    expect(graph.edges).toContainEqual({
      from: controller.id,
      to: createRoute.id,
      kind: 'handles',
      label: 'create',
    })
    expect(graph.edges).toContainEqual({
      from: getRoute.id,
      to: getHandler.id,
      kind: 'flows-to',
    })
    expect(graph.edges).toContainEqual({
      from: createRoute.id,
      to: bodyValidation.id,
      kind: 'flows-to',
    })
    expect(graph.edges).toContainEqual({
      from: bodyValidation.id,
      to: createHandler.id,
      kind: 'flows-to',
    })
  })

  it.each(['text', 'json', 'mermaid'])(
    'graph allは%s formatで利用できる',
    async (format) => {
      const output = io()
      expect(
        await runCli(
          [
            'graph',
            'all',
            '--format',
            format,
            '--entry',
            'integrations/http-crud/src/app.ts',
          ],
          output.value,
        ),
      ).toBe(0)
      expect(output.stdout.join('\n')).toContain('UsersController')
    },
  )

  it('graph allのMermaidでは同一Controllerを1nodeにdedupeする', async () => {
    const output = io()
    expect(
      await runCli(
        [
          'graph',
          'all',
          '--format',
          'mermaid',
          '--entry',
          'integrations/http-crud/src/app.ts',
        ],
        output.value,
      ),
    ).toBe(0)
    const lines = output.stdout.join('\n').split('\n')
    expect(
      lines.filter((line) =>
        line.includes('["HTTP Controller: UsersController"]'),
      ),
    ).toHaveLength(1)
    expect(lines.some((line) => line.includes('|"get"|'))).toBe(true)
    expect(lines.some((line) => line.includes('|"create"|'))).toBe(true)
    expect(lines).toContain('  subgraph sg0["Module: UsersModule"]')
    expect(lines).toContain('  subgraph sg1["API: GET /users/{id}"]')
    expect(lines).toContain('  subgraph sg2["API: POST /users"]')
    expect(graphLine(output, 'classDef provider')).toContain('fill:#BBF7D0')
    expect(graphLine(output, 'classDef controller')).toContain('fill:#BFDBFE')
    expect(graphLine(output, 'classDef middleware')).toContain('fill:#E9D5FF')
    expect(lines).toContain('  class n1 provider')
    expect(lines).toContain('  class n2 controller')
    expect(lines).toContain('  class n7 middleware')
    expect(lines).toContain(
      '  linkStyle 0 stroke:#4F46E5,color:#4F46E5,stroke-width:2px',
    )
    expect(lines).toContain(
      '  linkStyle 2 stroke:#2563EB,color:#2563EB,stroke-width:2px',
    )
    expect(lines).toContain(
      '  linkStyle 5 stroke:#D97706,color:#D97706,stroke-width:2px',
    )
    expect(lines).toContain(
      '  linkStyle 8 stroke:#9333EA,color:#9333EA,stroke-width:2px',
    )
    expect(lines).toContain(
      '  style sg0 fill:#F8FAFC,stroke:#4F46E5,color:#1E1B4B,stroke-width:2px',
    )
    expect(lines).toContain(
      '  style sg1 fill:#FFFBEB,stroke:#D97706,color:#78350F,stroke-width:2px',
    )
  })

  it('HTTP Mermaidも同一Controllerを1nodeにdedupeする', async () => {
    const output = io()
    expect(
      await runCli(
        [
          'graph',
          'http',
          '--format',
          'mermaid',
          '--entry',
          'integrations/http-crud/src/app.ts',
        ],
        output.value,
      ),
    ).toBe(0)
    const lines = output.stdout.join('\n').split('\n')
    expect(
      lines.filter((line) =>
        line.includes('["HTTP Controller: UsersController"]'),
      ),
    ).toHaveLength(1)
    expect(lines).toContain('  subgraph sg0["Module: UsersModule"]')
    expect(lines).toContain('  subgraph sg1["API: GET /users/{id}"]')
    expect(lines).toContain('  subgraph sg2["API: POST /users"]')
  })

  it('HTTP middlewareの実行順をgraph httpとgraph allの両方へ出す', async () => {
    const allOutput = io()
    expect(
      await runCli(
        [
          'graph',
          'all',
          '--format',
          'json',
          '--entry',
          'integrations/http-auth/src/app.ts',
        ],
        allOutput.value,
      ),
    ).toBe(0)

    const graph = JSON.parse(allOutput.stdout.join('\n'))
    const node = (kind: string, label: string) =>
      graph.nodes.find(
        (candidate: { kind: string; label: string }) =>
          candidate.kind === kind && candidate.label === label,
      )
    const route = node('entrypoint', 'GET /account')
    const bearer = node('middleware', 'bearerAuthentication')
    const authenticated = node('middleware', 'authenticated')
    const tenant = node('middleware', 'tenantAccess')
    const handler = node('handler', 'AccountController.get')

    expect(route).toBeDefined()
    expect(bearer).toMatchObject({ attributes: { route: 'get', index: 0 } })
    expect(authenticated).toMatchObject({
      attributes: { route: 'get', index: 1 },
    })
    expect(tenant).toMatchObject({ attributes: { route: 'get', index: 2 } })
    expect(handler).toBeDefined()
    expect(graph.edges).toEqual(
      expect.arrayContaining([
        { from: route.id, to: bearer.id, kind: 'flows-to' },
        { from: bearer.id, to: authenticated.id, kind: 'flows-to' },
        { from: authenticated.id, to: tenant.id, kind: 'flows-to' },
        { from: tenant.id, to: handler.id, kind: 'flows-to' },
      ]),
    )

    const httpOutput = io()
    expect(
      await runCli(
        [
          'graph',
          'http',
          '--format',
          'mermaid',
          '--entry',
          'integrations/http-auth/src/app.ts',
        ],
        httpOutput.value,
      ),
    ).toBe(0)
    const mermaid = httpOutput.stdout.join('\n')
    expect(mermaid).toContain('Middleware: bearerAuthentication')
    expect(mermaid).toContain('Middleware: authenticated')
    expect(mermaid).toContain('Middleware: tenantAccess')
    expect(mermaid).toContain('Handler: AccountController.get')
  })

  it('graphはsubject省略をusage付きでrejectする', async () => {
    const output = io()
    expect(
      await runCli(
        [
          'graph',
          '--format',
          'mermaid',
          '--entry',
          'integrations/http-crud/src/app.ts',
        ],
        output.value,
      ),
    ).toBe(2)
    expect(output.stderr.join('\n')).toContain(
      'graph requires one of: all, modules, di, executions, http, runtime.',
    )
    expect(output.stderr.join('\n')).toContain('Usage: loutre graph <subject>')
  })

  it('graphはinvalid subjectをallを含むvalid一覧付きでrejectする', async () => {
    const output = io()
    expect(
      await runCli(
        ['graph', 'unknown', '--entry', 'integrations/http-crud/src/app.ts'],
        output.value,
      ),
    ).toBe(2)
    expect(output.stderr.join('\n')).toContain(
      'graph requires one of: all, modules, di, executions, http, runtime.',
    )
  })

  it.each(['modules', 'di', 'http', 'executions', 'runtime'])(
    '既存graph subject %sは引き続き利用できる',
    async (subject) => {
      const output = io()
      expect(
        await runCli(
          [
            'graph',
            subject,
            '--format',
            'mermaid',
            '--entry',
            'integrations/http-crud/src/app.ts',
          ],
          output.value,
        ),
      ).toBe(0)
      expect(output.stdout.join('\n')).toContain('flowchart LR')
    },
  )

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
