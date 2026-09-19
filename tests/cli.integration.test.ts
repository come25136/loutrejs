import { createKernelApplication } from '@loutrejs/loutre'
import { bootstrapApplication } from '@loutrejs/loutre'
import { bindHttpServer } from '@loutrejs/loutre/http'
import { runCli } from '@loutrejs/cli'
import { startDevApplicationSupervisor } from '../packages/cli/src/dev/run-supervisor.js'
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
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

  async function waitForFileValue(
    file: string,
    expected: string,
    timeoutMs = 5_000,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      try {
        if ((await readFile(file, 'utf8')) === expected) return
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
    throw new Error(`Timed out waiting for ${file}=${expected}.`)
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

  it.each([
    [
      ['dev', '--entry', 'src/app.ts', '--port', '65536', '--', 'node'],
      'dev --port must be an integer from 0 to 65535.',
    ],
    [
      ['dev', '--entry', 'src/app.ts', '--origin', 'example.com', '--', 'node'],
      'dev --origin must be a URL origin: example.com',
    ],
  ])('devの接続設定を検証する', async (args, message) => {
    const output = io()
    expect(await runCli(args, output.value)).toBe(2)
    expect(output.stderr).toContain(message)
  })

  it('devはDevtoolsModuleがないApplicationを起動しない', async () => {
    const output = io()
    const code = await runCli(
      [
        'dev',
        '--entry',
        'integrations/http-crud/src/app.ts',
        '--',
        process.execPath,
        '-e',
        'process.exit(99)',
      ],
      output.value,
    )

    expect(code).toBe(2)
    expect(output.stderr).toContain(
      'loutre dev requires DevtoolsModule() in the Application imports.',
    )
  })

  it('devはApplication commandへlocal DevTools endpointを渡す', async () => {
    const output = io()
    const code = await runCli(
      [
        'dev',
        '--entry',
        'tests/fixtures/devtools-enabled-app.ts',
        '--port',
        '0',
        '--ignore',
        '.tmp',
        '--',
        process.execPath,
        '-e',
        [
          'const endpoint = process.env.LOUTRE_DEV_ENDPOINT;',
          'const runId = process.env.LOUTRE_DEV_RUN_ID;',
          "if (!/^ws:\\/\\/127\\.0\\.0\\.1:\\d+\\/__loutre\\/app$/.test(endpoint ?? '') || !runId?.startsWith('run_')) process.exit(7);",
        ].join(' '),
      ],
      output.value,
    )

    expect(code).toBe(0)
    const devServerLine = output.stdout.find((line) =>
      line.startsWith('Loutre Dev: '),
    )
    expect(devServerLine).toBeDefined()
    const devServer = new URL(devServerLine!.slice('Loutre Dev: '.length))
    expect(devServer.hostname).toBe('127.0.0.1')
    expect(Number(devServer.port)).toBeGreaterThan(0)
    expect(output.stdout.join('\n')).toContain(
      `Control channel: ws://127.0.0.1:${devServer.port}/__loutre/client`,
    )
    expect(output.stdout.join('\n')).toContain(
      `Application channel: ws://127.0.0.1:${devServer.port}/__loutre/app`,
    )
    const devtoolsUiLine = output.stdout.find((line) =>
      line.startsWith('Devtools UI: '),
    )
    expect(devtoolsUiLine).toBeDefined()
    const devtoolsUi = new URL(devtoolsUiLine!.slice('Devtools UI: '.length))
    expect(devtoolsUi.origin + devtoolsUi.pathname).toBe(
      'https://loutrejs.come25136.id/devtools/',
    )
    expect(devtoolsUi.search).toBe('')
    expect(devtoolsUi.hash).toBe('')
    expect(output.stdout.join('\n')).not.toContain('token')
  })

  it('devはApplication commandのspawn失敗時にもDev serverとsignal listenerを解放する', async () => {
    const output = io()
    const sigintListeners = process.listenerCount('SIGINT')
    const sigtermListeners = process.listenerCount('SIGTERM')

    await expect(
      runCli(
        [
          'dev',
          '--entry',
          'tests/fixtures/devtools-enabled-app.ts',
          '--port',
          '0',
          '--',
          `loutre-command-that-does-not-exist-${Date.now()}`,
        ],
        output.value,
      ),
    ).rejects.toMatchObject({ code: 'ENOENT' })

    expect(process.listenerCount('SIGINT')).toBe(sigintListeners)
    expect(process.listenerCount('SIGTERM')).toBe(sigtermListeners)
    const serverLine = output.stdout.find((line) =>
      line.startsWith('Loutre Dev: '),
    )
    expect(serverLine).toBeDefined()
    await expect(
      fetch(serverLine!.slice('Loutre Dev: '.length)),
    ).rejects.toThrow()
  })

  it('dev supervisorは終了signalを無視するchildをtimeout後に強制終了する', async () => {
    await mkdir(join(process.cwd(), '.tmp'), { recursive: true })
    const directory = await mkdtemp(
      join(process.cwd(), '.tmp', 'loutre-dev-force-stop-'),
    )
    const readyPath = join(directory, 'ready.txt')
    const command = [
      `const fs = require('node:fs');`,
      `process.on('SIGTERM', () => {});`,
      `fs.writeFileSync(${JSON.stringify(readyPath)}, 'ready');`,
      `setInterval(() => {}, 1000);`,
    ].join(' ')
    const supervisor = startDevApplicationSupervisor({
      command: [process.execPath, '-e', command],
      cwd: process.cwd(),
      environment: {},
      shutdownTimeoutMs: 100,
    })

    try {
      await waitForFileValue(readyPath, 'ready')
      await expect(supervisor.close()).resolves.toBeUndefined()
      await expect(supervisor.result).resolves.toBe(0)
    } finally {
      await supervisor.close().catch(() => undefined)
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('devはApplicationが異常終了してもDevToolsを維持しsource変更後に再起動する', async () => {
    await mkdir(join(process.cwd(), '.tmp'), { recursive: true })
    const directory = await mkdtemp(
      join(process.cwd(), '.tmp', 'loutre-dev-supervisor-'),
    )
    const applicationPath = join(directory, 'app.ts')
    const counterPath = join(directory, 'attempts.txt')
    const source = [
      "import { defineApplication, defineModule } from '../../packages/loutre/src/index.js'",
      "import { DevtoolsModule } from '../../packages/loutre/src/devtools/index.js'",
      'const AppModule = defineModule(() => ({ imports: [DevtoolsModule()] }))',
      'export default defineApplication({ modules: [AppModule()] })',
      '',
    ].join('\n')
    await writeFile(applicationPath, source)

    const output = io()
    const command = [
      `const fs = require('node:fs');`,
      `const file = ${JSON.stringify(counterPath)};`,
      `let count = 0;`,
      `try { count = Number(fs.readFileSync(file, 'utf8')) || 0 } catch {}`,
      `count += 1;`,
      `fs.writeFileSync(file, String(count));`,
      `process.exit(count === 1 ? 1 : 0);`,
    ].join(' ')

    const running = runCli(
      [
        'dev',
        '--entry',
        applicationPath,
        '--port',
        '0',
        '--',
        process.execPath,
        '-e',
        command,
      ],
      output.value,
    )

    try {
      await waitForFileValue(counterPath, '1')
      await vi.waitFor(() => {
        expect(output.stderr.join('\n')).toContain(
          'DevTools remains available; waiting for source changes.',
        )
      })
      const serverLine = output.stdout.find((line) =>
        line.startsWith('Loutre Dev: '),
      )
      expect(serverLine).toBeDefined()
      const response = await fetch(serverLine!.slice('Loutre Dev: '.length))
      expect(response.status).toBe(200)

      await writeFile(applicationPath, `${source}\n`)
      await expect(running).resolves.toBe(0)
      expect(await readFile(counterPath, 'utf8')).toBe('2')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('devはApplicationが生存中のsource変更ではApplicationを再起動しない', async () => {
    await mkdir(join(process.cwd(), '.tmp'), { recursive: true })
    const directory = await mkdtemp(
      join(process.cwd(), '.tmp', 'loutre-dev-running-app-'),
    )
    const applicationPath = join(directory, 'app.ts')
    const counterPath = join(directory, 'attempts.txt')
    const stopPath = join(directory, 'stop.txt')
    const source = [
      "import { defineApplication, defineModule } from '../../packages/loutre/src/index.js'",
      "import { DevtoolsModule } from '../../packages/loutre/src/devtools/index.js'",
      'const AppModule = defineModule(() => ({ imports: [DevtoolsModule()] }))',
      'export default defineApplication({ modules: [AppModule()] })',
      '',
    ].join('\n')
    await writeFile(applicationPath, source)

    const output = io()
    const command = [
      `const fs = require('node:fs');`,
      `const file = ${JSON.stringify(counterPath)};`,
      `const stop = ${JSON.stringify(stopPath)};`,
      `let count = 0;`,
      `try { count = Number(fs.readFileSync(file, 'utf8')) || 0 } catch {}`,
      `fs.writeFileSync(file, String(count + 1));`,
      `const timer = setInterval(() => { if (fs.existsSync(stop)) { clearInterval(timer); process.exit(0) } }, 20);`,
    ].join(' ')
    const running = runCli(
      [
        'dev',
        '--entry',
        applicationPath,
        '--port',
        '0',
        '--',
        process.execPath,
        '-e',
        command,
      ],
      output.value,
    )

    try {
      await waitForFileValue(counterPath, '1')
      await writeFile(applicationPath, `${source}\n`)
      await new Promise((resolve) => setTimeout(resolve, 500))
      expect(await readFile(counterPath, 'utf8')).toBe('1')
      await writeFile(stopPath, 'stop')
      await expect(running).resolves.toBe(0)
    } finally {
      await writeFile(stopPath, 'stop').catch(() => undefined)
      await running.catch(() => undefined)
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('devはinvalidなApplication ModelでもGraphを維持し修復後にApplicationを起動する', async () => {
    await mkdir(join(process.cwd(), '.tmp'), { recursive: true })
    const directory = await mkdtemp(
      join(process.cwd(), '.tmp', 'loutre-dev-invalid-model-'),
    )
    const applicationPath = join(directory, 'app.ts')
    const counterPath = join(directory, 'attempts.txt')
    const invalidSource = [
      "import { defineApplication, defineModule, inject, token } from '../../packages/loutre/src/index.js'",
      "import { DevtoolsModule } from '../../packages/loutre/src/devtools/index.js'",
      "const Missing = token('fixture.missing')",
      'class BrokenProvider { constructor(readonly missing = inject(Missing)) {} }',
      'const AppModule = defineModule(() => ({',
      '  imports: [DevtoolsModule()],',
      '  providers: [BrokenProvider],',
      '}))',
      'export default defineApplication({ modules: [AppModule()] })',
      '',
    ].join('\n')
    const validSource = [
      "import { defineApplication, defineModule, inject, provide, token } from '../../packages/loutre/src/index.js'",
      "import { DevtoolsModule } from '../../packages/loutre/src/devtools/index.js'",
      "const Missing = token('fixture.missing')",
      'class BrokenProvider { constructor(readonly missing = inject(Missing)) {} }',
      'const AppModule = defineModule(() => ({',
      '  imports: [DevtoolsModule()],',
      '  providers: [provide(Missing).useValue({}), BrokenProvider],',
      '}))',
      'export default defineApplication({ modules: [AppModule()] })',
      '',
    ].join('\n')
    await writeFile(applicationPath, invalidSource)

    const output = io()
    const command = [
      `const fs = require('node:fs');`,
      `const file = ${JSON.stringify(counterPath)};`,
      `fs.writeFileSync(file, '1');`,
      `process.exit(0);`,
    ].join(' ')
    const running = runCli(
      [
        'dev',
        '--entry',
        applicationPath,
        '--port',
        '0',
        '--',
        process.execPath,
        '-e',
        command,
      ],
      output.value,
    )

    try {
      await vi.waitFor(
        () => {
          expect(
            output.stdout.some((line) => line.startsWith('Loutre Dev: ')),
          ).toBe(true)
        },
        { timeout: 5_000 },
      )
      await new Promise((resolve) => setTimeout(resolve, 250))
      await expect(readFile(counterPath, 'utf8')).rejects.toThrow()

      await writeFile(applicationPath, validSource)
      await expect(running).resolves.toBe(0)
      expect(await readFile(counterPath, 'utf8')).toBe('1')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
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
    expect(output.stdout.join('\n')).toContain(
      'n0["`**Module: UsersModule**<br/>*↳ …/http-crud/src/index.ts:71*`"]',
    )
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

  it('Graph source locationはModel/IRでmachine-readableに保持される', async () => {
    const output = io()
    expect(
      await runCli(
        [
          'graph',
          'all',
          '--format',
          'json',
          '--entry',
          'tests/fixtures/source-location-app.ts',
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
    const source = (line: number, column: number) => ({
      file: 'tests/fixtures/source-location-app.ts',
      line,
      column,
    })

    expect(node('module', 'SourceModule')?.source).toEqual(source(53, 29))
    expect(node('provider', 'ClassService')).toMatchObject({
      attributes: { providerKind: 'class' },
      source: source(11, 8),
    })
    expect(node('provider', 'source-location.value')).toMatchObject({
      attributes: { providerKind: 'value' },
      source: source(58, 5),
    })
    expect(node('provider', 'source-location.factory')).toMatchObject({
      attributes: { providerKind: 'factory' },
      source: source(59, 5),
    })
    expect(node('provider', 'source-location.conditional')).toMatchObject({
      attributes: { providerKind: 'conditional' },
      source: source(60, 5),
    })
    expect(node('execution', 'SourceController')?.source).toEqual(
      source(43, 33),
    )
    expect(node('entrypoint', 'POST /source')?.source).toEqual(source(32, 31))
    expect(node('middleware', 'audit')?.source).toEqual(source(25, 32))
    expect(node('handler', 'SourceController.create')?.source).toEqual(
      source(43, 33),
    )
  })

  it('外部factoryで生成したHTTP middlewareもローカル生成地点のsourceを保持する', async () => {
    const output = io()
    expect(
      await runCli(
        [
          'graph',
          'all',
          '--format',
          'json',
          '--entry',
          'examples/basic-auth/src/app.ts',
        ],
        output.value,
      ),
    ).toBe(0)

    const graph = JSON.parse(output.stdout.join('\n'))
    const middleware = graph.nodes.find(
      (node: { kind: string; label: string }) =>
        node.kind === 'middleware' && node.label === 'basicAuthentication',
    )
    expect(middleware?.source).toEqual({
      file: 'examples/basic-auth/src/layers/authentication.ts',
      line: 5,
      column: 36,
    })
  })

  it('Graph source locationはaliasと変数compositionでも定義元を保持する', async () => {
    const output = io()
    expect(
      await runCli(
        [
          'graph',
          'all',
          '--format',
          'json',
          '--entry',
          'tests/fixtures/source-location-composition-app.ts',
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
    const source = (line: number, column: number) => ({
      file: 'tests/fixtures/source-location-composition-app.ts',
      line,
      column,
    })

    expect(node('provider', 'RealService')?.source).toEqual(source(15, 8))
    expect(node('provider', 'source-location.composed-value')?.source).toEqual(
      source(28, 20),
    )
    expect(node('entrypoint', 'POST /composed')?.source).toEqual(source(30, 18))
    expect(node('handler', 'ComposedController.create')?.source).toEqual(
      source(31, 20),
    )
    expect(node('provider', 'EventEmitter')?.source).toBeUndefined()
  })

  it('UTF-8 BOM付きApplicationでもsource instrumentationでcodeを壊さない', async () => {
    const output = io()
    expect(
      await runCli(
        [
          'graph',
          'all',
          '--format',
          'json',
          '--entry',
          'tests/fixtures/source-location-bom-app.ts',
        ],
        output.value,
      ),
    ).toBe(0)

    const graph = JSON.parse(output.stdout.join('\n'))
    const provider = graph.nodes.find(
      (node: { kind: string; label: string }) =>
        node.kind === 'provider' && node.label === 'BomService',
    )
    const module = graph.nodes.find(
      (node: { kind: string; label: string }) =>
        node.kind === 'module' && node.label === 'BomModule',
    )

    expect(provider?.source).toEqual({
      file: 'tests/fixtures/source-location-bom-app.ts',
      line: 3,
      column: 1,
    })
    expect(module?.source).toEqual({
      file: 'tests/fixtures/source-location-bom-app.ts',
      line: 5,
      column: 16,
    })
  })

  it('namespace importとnested class providerでもsource locationを保持する', async () => {
    const output = io()
    expect(
      await runCli(
        [
          'graph',
          'all',
          '--format',
          'json',
          '--entry',
          'tests/fixtures/source-location-namespace-nested-app.ts',
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
    const source = (line: number, column: number) => ({
      file: 'tests/fixtures/source-location-namespace-nested-app.ts',
      line,
      column,
    })

    expect(node('provider', 'NestedService')?.source).toEqual(source(5, 3))
    expect(node('module', 'NamespaceNestedModule')?.source).toEqual(
      source(25, 10),
    )
    expect(node('execution', 'NamespaceNestedController')?.source).toEqual(
      source(15, 22),
    )
  })

  it('useClass providerはimplementation class identityのsourceを使う', async () => {
    const output = io()
    expect(
      await runCli(
        [
          'graph',
          'all',
          '--format',
          'json',
          '--entry',
          'tests/fixtures/source-location-use-class-app.ts',
        ],
        output.value,
      ),
    ).toBe(0)

    const graph = JSON.parse(output.stdout.join('\n'))
    const provider = (label: string) =>
      graph.nodes.find(
        (candidate: { kind: string; label: string }) =>
          candidate.kind === 'provider' && candidate.label === label,
      )
    const localSource = {
      file: 'tests/fixtures/source-location-use-class-app.ts',
      line: 9,
      column: 1,
    }

    expect(provider('LocalService')?.source).toEqual(localSource)
    expect(provider('review.local-class')?.source).toEqual(localSource)
    expect(provider('review.external-class')?.source).toBeUndefined()
  })

  it('ambient classと外部call aliasを安全に扱いhandlerはimplementation sourceを使う', async () => {
    const output = io()
    expect(
      await runCli(
        [
          'graph',
          'all',
          '--format',
          'json',
          '--entry',
          'tests/fixtures/source-location-safety-app.ts',
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
    const controllerSource = {
      file: 'tests/fixtures/source-location-safety-app.ts',
      line: 21,
      column: 20,
    }

    expect(node('provider', 'EventEmitter')?.source).toBeUndefined()
    expect(node('execution', 'SafetyController')?.source).toEqual(
      controllerSource,
    )
    expect(node('handler', 'SafetyController.create')?.source).toEqual(
      controllerSource,
    )
  })

  it('graph modules JSONでもsource locationを保持する', async () => {
    const output = io()
    expect(
      await runCli(
        [
          'graph',
          'modules',
          '--format',
          'json',
          '--entry',
          'tests/fixtures/source-location-app.ts',
        ],
        output.value,
      ),
    ).toBe(0)
    const modules = JSON.parse(output.stdout.join('\n')).modules
    expect(modules[0].source).toEqual({
      file: 'tests/fixtures/source-location-app.ts',
      line: 53,
      column: 29,
    })
  })

  it.each([
    ['modules', 'source: tests/fixtures/source-location-app.ts:53:29'],
    ['di', 'source: tests/fixtures/source-location-app.ts:11:8'],
    ['http', 'route source: tests/fixtures/source-location-app.ts:32:31'],
    ['executions', 'source: tests/fixtures/source-location-app.ts:43:33'],
  ] as const)(
    'graph %s textでもsource locationを保持する',
    async (subject, expected) => {
      const output = io()
      expect(
        await runCli(
          [
            'graph',
            subject,
            '--format',
            'text',
            '--entry',
            'tests/fixtures/source-location-app.ts',
          ],
          output.value,
        ),
      ).toBe(0)
      expect(output.stdout.join('\n')).toContain(expected)
    },
  )

  it('Mermaid Markdown String内のbacktickをentity escapeする', async () => {
    const output = io()
    expect(
      await runCli(
        [
          'graph',
          'all',
          '--format',
          'mermaid',
          '--entry',
          'tests/fixtures/source-location-`backtick`-app.ts',
        ],
        output.value,
      ),
    ).toBe(0)

    const graph = output.stdout.join('\n')
    expect(graph).toContain(
      '`**Provider: provider#96;name**<br/>*↳ tests/fixtures/source-location-#96;backtick#96;-app.ts:9*`',
    )
    expect(graph).toContain('Module: Backtick#96;Module')
    expect(graph).not.toContain('provider`name')
  })

  it('Mermaid node labelへproject-relative source locationを表示する', async () => {
    const output = io()
    expect(
      await runCli(
        [
          'graph',
          'all',
          '--format',
          'mermaid',
          '--theme',
          'dark',
          '--entry',
          'tests/fixtures/source-location-app.ts',
        ],
        output.value,
      ),
    ).toBe(0)
    const graph = output.stdout.join('\n')
    expect(graph).toContain('"markdownAutoWrap":false')
    expect(graph).toContain('white-space:nowrap')
    expect(graph).toContain(
      '`**Provider: ClassService**<br/>*↳ tests/fixtures/source-location-app.ts:11*`',
    )
    expect(graph).toContain(
      '`**Route: POST /source**<br/>*↳ tests/fixtures/source-location-app.ts:32*`',
    )
    expect(graph).toContain(
      '`**Handler: SourceController.create**<br/>*↳ tests/fixtures/source-location-app.ts:43*`',
    )
    expect(graph).not.toContain('source-location-app.ts:11:8')
    expect(graph).not.toContain(process.cwd())
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
        line.includes('["`**HTTP Controller: UsersController**<br/>'),
      ),
    ).toHaveLength(1)
    expect(lines.some((line) => line.includes('|"get"|'))).toBe(true)
    expect(lines.some((line) => line.includes('|"create"|'))).toBe(true)
    expect(lines).toContain('  subgraph sg0["Module: UsersModule"]')
    expect(lines).toContain('  subgraph sg1["API: GET /users/{id}"]')
    expect(lines).toContain('  subgraph sg2["API: POST /users"]')
    expect(graphLine(output, 'classDef provider')).toContain('fill:#DCFCE7')
    expect(graphLine(output, 'classDef controller')).toContain('fill:#DBEAFE')
    expect(graphLine(output, 'classDef middleware')).toContain('fill:#F3E8FF')
    expect(lines).toContain('  class n1 provider')
    expect(lines).toContain('  class n2 controller')
    expect(lines).toContain('  class n7 middleware')
    expect(lines).toContain(
      '  linkStyle 0 stroke:#6D28D9,color:#111827,stroke-width:2px',
    )
    expect(lines).toContain(
      '  linkStyle 2 stroke:#1D4ED8,color:#111827,stroke-width:2px',
    )
    expect(lines).toContain(
      '  linkStyle 5 stroke:#B45309,color:#111827,stroke-width:2px',
    )
    expect(lines).toContain(
      '  linkStyle 8 stroke:#7E22CE,color:#111827,stroke-width:2px',
    )
    expect(lines).toContain(
      '  style sg0 fill:#F8FAFC,stroke:#6D28D9,color:#111827,stroke-width:2px',
    )
    expect(lines).toContain(
      '  style sg1 fill:#FFFBEB,stroke:#B45309,color:#111827,stroke-width:2px',
    )
  })

  it('Mermaid dark themeは白文字とdark paletteを使う', async () => {
    const output = io()
    expect(
      await runCli(
        [
          'graph',
          'all',
          '--format',
          'mermaid',
          '--theme',
          'dark',
          '--entry',
          'integrations/http-crud/src/app.ts',
        ],
        output.value,
      ),
    ).toBe(0)
    const graph = output.stdout.join('\n')
    expect(graph).toContain('"edgeLabelBackground":"#111827"')
    expect(graphLine(output, 'classDef controller')).toContain(
      'fill:#1E3A8A,stroke:#60A5FA,color:#FFFFFF',
    )
    expect(graphLine(output, 'classDef provider')).toContain(
      'fill:#14532D,stroke:#4ADE80,color:#FFFFFF',
    )
    expect(graphLine(output, 'linkStyle 2')).toContain(
      'stroke:#60A5FA,color:#F8FAFC',
    )
    expect(graphLine(output, 'style sg0')).toContain('color:#FFFFFF')
  })

  it('graph --themeはlight/darkだけ受け付けMermaid専用', async () => {
    const invalid = io()
    expect(
      await runCli(
        [
          'graph',
          'all',
          '--format',
          'mermaid',
          '--theme',
          'sepia',
          '--entry',
          'integrations/http-crud/src/app.ts',
        ],
        invalid.value,
      ),
    ).toBe(2)
    expect(invalid.stderr).toContain(
      'graph --theme must be one of: light, dark.',
    )

    const json = io()
    expect(
      await runCli(
        [
          'graph',
          'all',
          '--format',
          'json',
          '--theme',
          'dark',
          '--entry',
          'integrations/http-crud/src/app.ts',
        ],
        json.value,
      ),
    ).toBe(2)
    expect(json.stderr).toContain(
      'graph --theme is only supported with --format mermaid.',
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
        line.includes('["`**HTTP Controller: UsersController**<br/>'),
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
    for (const command of ['run', 'start']) {
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

  it('production buildではsource instrumentationがtree-shakingを阻害しない', async () => {
    const output = io()
    const directory = await mkdtemp(join(tmpdir(), 'loutre-tree-shaking-'))
    try {
      expect(
        await runCli(
          [
            'build',
            'tests/fixtures/source-location-tree-shaking-app.ts',
            '--out-dir',
            directory,
          ],
          output.value,
        ),
      ).toBe(0)
      const source = await readFile(join(directory, 'application.mjs'), 'utf8')
      expect(source).not.toContain('SOURCE_LOCATION_TREE_SHAKING_SENTINEL')
      expect(source).not.toContain('CompletelyUnusedSourceLocationSentinel')
      expect(source).not.toContain('registerSourceLocation')
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
