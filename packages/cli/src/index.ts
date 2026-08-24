import {
  existsSync,
  statSync,
  watch as watchFile,
  type FSWatcher,
} from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import type { Server } from 'node:http'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  compileTypeScriptSource,
  createSourceCompilerSession,
  createRuntimeLinkageBootstrap,
  createRuntimeLinkagePlan,
  transformSourceForRuntimeLinkage,
  type RuntimeLinkagePlan,
} from '@loutrejs/compiler'
import { checkCapabilities, type RuntimeCapabilities } from '@loutrejs/runtime'
import { bunRuntime } from '@loutrejs/runtime-bun'
import { denoRuntime } from '@loutrejs/runtime-deno'
import { electronRuntime } from '@loutrejs/runtime-electron'
import { lambdaRuntime } from '@loutrejs/runtime-lambda'
import { nodeRuntime } from '@loutrejs/runtime-node'
import { createNodeHttpServer } from '@loutrejs/runtime-node'
import type { HttpApplication } from '@loutrejs/http'
import { workerdRuntime } from '@loutrejs/runtime-workerd'
import { build as buildWithEsbuild, type Loader, type Plugin } from 'esbuild'
import {
  printStartupBanner,
  type StartupBannerRenderOptions,
} from './startup-banner.js'

export {
  detectStartupBannerTerminal,
  printStartupBanner,
  renderStartupBanner,
  type StartupBannerInfo,
  type StartupBannerRenderOptions,
  type StartupBannerTerminalOutput,
} from './startup-banner.js'

export interface CliIO {
  readonly cwd: string
  readonly stdout: (value: string) => void
  readonly stderr: (value: string) => void
  readonly terminal?: StartupBannerRenderOptions
}

const runtimes: Readonly<Record<string, RuntimeCapabilities>> = {
  node: nodeRuntime,
  deno: denoRuntime,
  bun: bunRuntime,
  workerd: workerdRuntime,
  electron: electronRuntime,
  lambda: lambdaRuntime,
}

export async function runCli(
  args: readonly string[],
  io: CliIO,
): Promise<number> {
  const [command, subject] = args
  if (!command || command === 'help' || command === '--help') {
    io.stdout(helpText())
    return 0
  }

  const manifest = () =>
    compileTypeScriptSource({
      tsconfigPath: resolve(io.cwd, 'tsconfig.json'),
    })

  switch (command) {
    case 'check': {
      const result = manifest()
      if (result.diagnostics.length === 0) {
        io.stdout('Loutre Application Graphは有効です。')
        return 0
      }
      for (const diagnostic of result.diagnostics) {
        io.stderr(`${diagnostic.code} ${diagnostic.path}\n${diagnostic.message}`)
      }
      return 1
    }
    case 'doctor': {
      const runtimeName = subject ?? 'node'
      const runtime = runtimes[runtimeName]
      if (!runtime) {
        io.stderr(`未定義のRuntimeです: ${runtimeName}`)
        return 2
      }
      const result = manifest()
      const required = requiredCapabilities(result)
      const check = checkCapabilities(required, runtime)
      io.stdout(`Runtime: ${runtime.runtime}`)
      io.stdout(`Required: ${check.required.join(', ') || '(なし)'}`)
      io.stdout(`Missing: ${check.missing.join(', ') || '(なし)'}`)
      return check.ok ? 0 : 1
    }
    case 'graph': {
      const result = manifest()
      switch (subject) {
        case 'modules':
          for (const module of result.modules) {
            io.stdout(`${module.name}`)
            if (module.description !== undefined) {
              io.stdout(`  description: ${module.description}`)
            }
            io.stdout(`  imports: ${module.imports.join(', ') || '(なし)'}`)
            io.stdout(`  providers: ${module.providers.join(', ') || '(なし)'}`)
            io.stdout(`  exports: ${module.exports.join(', ') || '(なし)'}`)
            io.stdout(`  lifecycle: ${module.lifecycle.join(', ') || '(なし)'}`)
            io.stdout(`  requires: ${module.requires.join(', ') || '(なし)'}`)
          }
          return 0
        case 'di':
          for (const constructor of result.constructors) {
            io.stdout(
              `${constructor.className}\n  inject: ${constructor.dependencies.map(({ reference }) => reference).join(', ') || '(なし)'}`,
            )
          }
          return 0
        case 'contracts':
          for (const pipeline of result.pipelines) {
            io.stdout(`${pipeline.contract}.${pipeline.procedure} [${pipeline.protocol}]`)
            for (const layer of pipeline.layers) {
              io.stdout(`  ${layer.index + 1} ${layer.name} ${layer.role}`)
              if (layer.requires.length > 0) {
                io.stdout(`    requires: ${layer.requires.join(', ')}`)
              }
              if (layer.provides.length > 0) {
                io.stdout(`    provides: ${layer.provides.join(', ')}`)
              }
              if (layer.requiresValidated.length > 0) {
                io.stdout(
                  `    requires validated: ${layer.requiresValidated.join(', ')}`,
                )
              }
            }
          }
          return 0
        case 'runtime':
          for (const capability of requiredCapabilities(result)) {
            io.stdout(capability)
          }
          return 0
        default:
          io.stderr('graphにはmodules、di、contracts、runtimeのいずれかが必要です。')
          return 2
      }
    }
    case 'explain': {
      if (!subject) {
        io.stderr('explainには対象が必要です。')
        return 2
      }
      const result = manifest()
      const pipelines = result.pipelines.filter(
        (pipeline) =>
          `${pipeline.contract}.${pipeline.procedure}` === subject ||
          pipeline.contract === subject,
      )
      const constructor = result.constructors.find(
        ({ className }) => className === subject,
      )
      if (pipelines.length === 0 && !constructor) {
        io.stderr(`対象が見つかりません: ${subject}`)
        return 1
      }
      for (const pipeline of pipelines) {
        io.stdout(`${pipeline.contract}.${pipeline.procedure} [${pipeline.protocol}]`)
        for (const layer of pipeline.layers) {
          io.stdout(`${layer.index + 1}. ${layer.name} (${layer.role})`)
        }
      }
      if (constructor) {
        io.stdout(`${constructor.className} constructor`)
        for (const dependency of constructor.dependencies) {
          io.stdout(
            `${dependency.index}. ${dependency.parameter} <- ${dependency.reference}`,
          )
        }
      }
      return 0
    }
    case 'build': {
      if (!subject) {
        io.stderr('buildには明示的なApplication entryが必要です。')
        return 2
      }
      const outputDirectory = resolve(
        io.cwd,
        readOption(args, '--out-dir') ?? 'dist/loutre',
      )
      const plan = createRuntimeLinkagePlan({
        tsconfigPath: resolve(io.cwd, 'tsconfig.json'),
        entry: resolve(io.cwd, subject),
      })
      await mkdir(outputDirectory, { recursive: true })
      const entryOutput = join(outputDirectory, 'application.mjs')
      await emitLinkedApplication(plan, entryOutput)
      const manifestOutput = join(outputDirectory, 'loutre.manifest.json')
      await writeFile(
        manifestOutput,
        `${JSON.stringify({ ...plan.manifest, fingerprint: plan.fingerprint }, null, 2)}\n`,
        'utf8',
      )
      io.stdout(`Applicationを出力しました: ${entryOutput}`)
      io.stdout(`Graph Manifestを出力しました: ${manifestOutput}`)
      return 0
    }
    case 'dev': {
      if (!subject) {
        io.stderr(
          'devには明示的なApplication entryが必要です。filesystem discoveryは行いません。',
        )
        return 2
      }
      return startDevelopmentServer(
        resolve(io.cwd, subject),
        resolve(io.cwd, 'tsconfig.json'),
        readPort(args),
        io,
      )
    }
    case 'start': {
      if (!subject) {
        io.stderr(
          'startには明示的なApplication entryが必要です。filesystem discoveryは行いません。',
        )
        return 2
      }
      const startedAt = performance.now()
      const [applicationName, frameworkVersion] = await Promise.all([
        readApplicationName(io.cwd),
        readFrameworkVersion(),
      ])
      const port = readPort(args)
      const application = await loadLinkedHttpApplication(
        resolve(io.cwd, subject),
        resolve(io.cwd, 'tsconfig.json'),
      )
      await application.initialize()
      const server = createNodeHttpServer(application, {
        onListening: (url) =>
          writeStartupBanner(io, {
            application: applicationName,
            version: frameworkVersion,
            server: url,
            environment: process.env.NODE_ENV ?? 'production',
            startedAt,
          }),
      })
      server.listen(port, '127.0.0.1')
      await new Promise<void>((resolveListening, reject) => {
        server.once('listening', resolveListening)
        server.once('error', reject)
      })
      const shutdown = async (signal: string) => {
        await closeServer(server)
        await application.shutdown(signal)
      }
      process.once('SIGINT', () => void shutdown('SIGINT'))
      process.once('SIGTERM', () => void shutdown('SIGTERM'))
      return 0
    }
    default:
      io.stderr(`不明なcommandです: ${command}`)
      return 2
  }
}

interface LinkedApplicationBuild {
  readonly application: HttpApplication
  readonly plan: RuntimeLinkagePlan
  readonly sourceFiles: readonly string[]
}

async function startDevelopmentServer(
  entry: string,
  tsconfigPath: string,
  port: number,
  io: CliIO,
): Promise<number> {
  const initialStartedAt = performance.now()
  const [builder, applicationName, frameworkVersion] = await Promise.all([
    createIncrementalApplicationBuilder(entry, tsconfigPath),
    readApplicationName(io.cwd),
    readFrameworkVersion(),
  ])
  let listenPort = port
  let active: {
    readonly application: HttpApplication
    readonly server: Server
  } | undefined

  const launch = async (application: HttpApplication, startedAt: number) => {
    let server: Server | undefined
    try {
      await application.initialize()
      server = createNodeHttpServer(application, {
        onListening: (url) =>
          writeStartupBanner(io, {
            application: applicationName,
            version: frameworkVersion,
            server: url,
            environment: process.env.NODE_ENV ?? 'development',
            startedAt,
          }),
      })
      server.listen(listenPort, '127.0.0.1')
      await new Promise<void>((resolveListening, reject) => {
        server!.once('listening', resolveListening)
        server!.once('error', reject)
      })
      const address = server.address()
      if (listenPort === 0 && typeof address === 'object' && address) {
        listenPort = address.port
      }
      active = { application, server }
    } catch (error) {
      if (server?.listening) await closeServer(server).catch(() => undefined)
      await application.shutdown('startup-error').catch(() => undefined)
      throw error
    }
  }

  const stop = async (signal: string) => {
    const current = active
    active = undefined
    if (!current) return
    try {
      await closeServer(current.server)
    } finally {
      await current.application.shutdown(signal)
    }
  }

  let initial: LinkedApplicationBuild
  try {
    initial = await builder.build()
    await launch(initial.application, initialStartedAt)
  } catch (error) {
    await builder.close()
    throw error
  }

  let stopping = false
  let reloadTimer: ReturnType<typeof setTimeout> | undefined
  let reloading = false
  let pendingReload = false
  let activeReload: Promise<void> | undefined
  const changedFiles = new Set<string>()
  const watcher = new SourceWatchSet((paths) => {
    if (stopping) return
    for (const path of paths) changedFiles.add(path)
    if (reloadTimer) clearTimeout(reloadTimer)
    reloadTimer = setTimeout(requestReload, 75)
  })
  watcher.replace([...initial.sourceFiles, tsconfigPath])

  function requestReload() {
    reloadTimer = undefined
    if (stopping) return
    if (reloading) {
      pendingReload = true
      return
    }
    activeReload = reloadUntilCurrent().finally(() => {
      activeReload = undefined
    })
  }

  async function reloadUntilCurrent(): Promise<void> {
    reloading = true
    try {
      do {
        pendingReload = false
        let next: LinkedApplicationBuild | undefined
        try {
          const startedAt = performance.now()
          await stop('reload')
          const changes = [...changedFiles]
          changedFiles.clear()
          next = await builder.build(changes, (plan) => {
            watcher.add([...plan.manifest.files, tsconfigPath])
          })
          if (stopping) {
            await next.application.shutdown('dev-server-shutdown')
            next = undefined
            return
          }
          const sourceFiles = next.sourceFiles
          await launch(next.application, startedAt)
          next = undefined
          watcher.replace([...sourceFiles, tsconfigPath])
        } catch (error) {
          if (next) {
            await next.application.shutdown('reload-error').catch((shutdownError) => {
              io.stderr(
                `再読み込み候補の終了処理に失敗しました: ${errorMessage(shutdownError)}`,
              )
            })
          }
          io.stderr(
            `Applicationの再起動に失敗しました。Applicationは停止しています。\n${errorMessage(error)}`,
          )
        }
      } while (pendingReload && !stopping)
    } finally {
      reloading = false
    }
  }

  const shutdown = async (signal: string) => {
    if (stopping) return
    stopping = true
    if (reloadTimer) clearTimeout(reloadTimer)
    watcher.close()
    await activeReload
    await stop(signal)
    await builder.close()
  }
  const reportShutdownError = (error: unknown) => {
    io.stderr(`Development serverの終了処理に失敗しました: ${errorMessage(error)}`)
  }
  process.once('SIGINT', () => void shutdown('SIGINT').catch(reportShutdownError))
  process.once('SIGTERM', () => void shutdown('SIGTERM').catch(reportShutdownError))
  return 0
}

interface IncrementalApplicationBuilder {
  build(
    changedFiles?: readonly string[],
    onPlan?: (plan: RuntimeLinkagePlan) => void,
  ): Promise<LinkedApplicationBuild>
  close(): Promise<void>
}

async function createIncrementalApplicationBuilder(
  entry: string,
  tsconfigPath: string,
): Promise<IncrementalApplicationBuilder> {
  const compiler = createSourceCompilerSession()
  const directory = await mkdtemp(join(tmpdir(), 'loutre-dev-'))
  let generation = 0
  let closed = false
  return {
    async build(changedFiles = [], onPlan) {
      if (closed) throw new Error('終了済みDevelopment Compilerは利用できません')
      const plan = createRuntimeLinkagePlan(
        {
          tsconfigPath,
          entry,
          ...(changedFiles.length > 0
            ? {
                fileChanges: {
                  changed: changedFiles.filter(existsSync),
                  deleted: changedFiles.filter((path) => !existsSync(path)),
                },
              }
            : {}),
        },
        compiler,
      )
      onPlan?.(plan)
      const output = join(directory, `application-${generation++}.mjs`)
      const sourceFiles = await emitLinkedApplication(plan, output)
      return {
        application: await importHttpApplication(output),
        plan,
        sourceFiles: [...new Set([...plan.manifest.files, ...sourceFiles])],
      }
    },
    async close() {
      if (closed) return
      closed = true
      compiler.close()
      await rm(directory, { recursive: true, force: true })
    },
  }
}

class SourceWatchSet {
  readonly #watchers = new Map<string, FSWatcher>()
  readonly #versions = new Map<string, string>()

  constructor(readonly onChange: (paths: readonly string[]) => void) {}

  add(paths: readonly string[]): void {
    const watchTargets = new Map<string, boolean>()
    for (const requested of paths) {
      const absolute = resolve(requested)
      this.#versions.set(absolute, sourceVersion(absolute))
      watchTargets.set(absolute, watchTargets.get(absolute) ?? false)
      watchTargets.set(dirname(absolute), true)
    }
    for (const [path, directory] of watchTargets) {
      if (this.#watchers.has(path) || !existsSync(path)) continue
      try {
        const watcher = watchFile(path, (_event, fileName) => {
          const changed =
            directory && fileName ? resolve(path, fileName.toString()) : path
          if (/\.(?:[cm]?[jt]sx?|json)$/.test(changed)) {
            this.#notifyChange(changed)
          }
        })
        watcher.on('error', () => {
          watcher.close()
          if (this.#watchers.get(path) === watcher) {
            this.#watchers.delete(path)
          }
          this.#notifyChange(path)
        })
        this.#watchers.set(path, watcher)
      } catch {
        this.#notifyChange(path)
      }
    }
  }

  replace(paths: readonly string[]): void {
    for (const watcher of this.#watchers.values()) watcher.close()
    this.#watchers.clear()
    this.add(paths)
  }

  close(): void {
    for (const watcher of this.#watchers.values()) watcher.close()
    this.#watchers.clear()
    this.#versions.clear()
  }

  #notifyChange(path: string): void {
    const version = sourceVersion(path)
    if (this.#versions.get(path) === version) return
    this.#versions.set(path, version)
    this.onChange([path])
  }
}

function sourceVersion(path: string): string {
  try {
    const stats = statSync(path, { bigint: true })
    return [stats.dev, stats.ino, stats.size, stats.mtimeNs, stats.ctimeNs].join(':')
  } catch {
    return 'missing'
  }
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolveClosed, reject) => {
    server.close((error) => (error ? reject(error) : resolveClosed()))
  })
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function writeStartupBanner(
  io: CliIO,
  details: {
    readonly application: string
    readonly version: string
    readonly server: string
    readonly environment: string
    readonly startedAt: number
  },
): void {
  printStartupBanner(
    {
      application: details.application,
      version: details.version,
      server: details.server,
      runtime: `Node.js ${process.versions.node}`,
      environment: details.environment,
      startupDurationMs: performance.now() - details.startedAt,
    },
    io.terminal ?? { isTTY: false, color: false },
    io.stdout,
  )
}

async function readApplicationName(cwd: string): Promise<string> {
  try {
    const manifest = JSON.parse(
      await readFile(resolve(cwd, 'package.json'), 'utf8'),
    ) as { readonly name?: unknown }
    if (typeof manifest.name === 'string' && manifest.name.length > 0) {
      return manifest.name.split('/').at(-1) ?? manifest.name
    }
  } catch {
    // package.jsonがないApplicationではdirectory名を使用する。
  }
  return basename(cwd)
}

async function readFrameworkVersion(): Promise<string> {
  try {
    const manifest = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { readonly version?: unknown }
    if (typeof manifest.version === 'string') return manifest.version
  } catch {
    // package metadataを読めない実行形態ではunknownを表示する。
  }
  return 'unknown'
}

async function loadLinkedHttpApplication(
  entry: string,
  tsconfigPath: string,
): Promise<HttpApplication> {
  const plan = createRuntimeLinkagePlan({ tsconfigPath, entry })
  const directory = await mkdtemp(join(tmpdir(), 'loutre-bootstrap-'))
  const output = join(directory, 'application.mjs')
  try {
    await emitLinkedApplication(plan, output)
    return await importHttpApplication(output)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

async function emitLinkedApplication(
  plan: RuntimeLinkagePlan,
  output: string,
): Promise<readonly string[]> {
  const workingDirectory = dirname(plan.entry)
  const result = await buildWithEsbuild({
    absWorkingDir: workingDirectory,
    stdin: {
      contents: createRuntimeLinkageBootstrap(plan),
      loader: 'ts',
      resolveDir: dirname(plan.entry),
      sourcefile: 'loutre-generated-bootstrap.ts',
    },
    outfile: output,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node24',
    sourcemap: 'inline',
    metafile: true,
    plugins: [runtimeLinkagePlugin(plan)],
  })
  return Object.keys(result.metafile.inputs)
    .filter((path) => path !== 'loutre-generated-bootstrap.ts')
    .map((path) => resolve(workingDirectory, path))
}

async function importHttpApplication(output: string): Promise<HttpApplication> {
  const module = await import(`${pathToFileURL(output).href}?loutre=${Date.now()}`)
  const application = module.default ?? module.application
  if (
    !application ||
    typeof application.initialize !== 'function' ||
    typeof application.shutdown !== 'function' ||
    typeof application.onServerListening !== 'function' ||
    typeof application.handle !== 'function'
  ) {
    throw new Error(
      'Application entryはdefaultまたはapplication named exportとしてHttpApplicationを公開する必要があります。',
    )
  }
  return application as HttpApplication
}

function runtimeLinkagePlugin(plan: RuntimeLinkagePlan): Plugin {
  const fragments = new Map(
    plan.fragments.map((fragment) => [resolve(fragment.file), fragment]),
  )
  return {
    name: 'loutre-runtime-linkage',
    setup(build) {
      build.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, async (args) => {
        const fragment = fragments.get(resolve(args.path))
        if (!fragment) return undefined
        const source = await readFile(args.path, 'utf8')
        return {
          contents: transformSourceForRuntimeLinkage(source, fragment),
          loader: loaderFor(args.path),
        }
      })
    },
  }
}

function loaderFor(path: string): Loader {
  switch (extname(path)) {
    case '.tsx':
      return 'tsx'
    case '.jsx':
      return 'jsx'
    case '.js':
    case '.mjs':
    case '.cjs':
      return 'js'
    default:
      return 'ts'
  }
}

function readOption(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name)
  return index < 0 ? undefined : args[index + 1]
}

function readPort(args: readonly string[]): number {
  const index = args.indexOf('--port')
  if (index < 0) return 3000
  const port = Number(args[index + 1])
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(`不正なportです: ${args[index + 1] ?? ''}`)
  }
  return port
}

function requiredCapabilities(result: ReturnType<typeof compileTypeScriptSource>) {
  const required = new Set(result.capabilities)
  if (result.pipelines.some(({ protocol }) => protocol === 'messagePort')) {
    required.add('messagePort.send')
    required.add('messagePort.receive')
  }
  if (
    result.pipelines.some(({ layers }) =>
      layers.some(({ name }) => name.includes('server-stream')),
    )
  ) {
    required.add('http.response.streaming')
  }
  return [...required]
}

function helpText(): string {
  return [
    'Loutre CLI',
    '  loutre check',
    '  loutre doctor [node|deno|bun|workerd|electron|lambda]',
    '  loutre graph modules|di|contracts|runtime',
    '  loutre explain <target>',
    '  loutre build <明示entry> [--out-dir <directory>]',
    '  loutre dev <明示entry> [--port <port>]',
    '  loutre start <明示entry> [--port <port>]',
  ].join('\n')
}
