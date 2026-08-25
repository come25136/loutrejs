import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, statSync, watch as watchFile, type FSWatcher } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import type { Server } from 'node:http'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import type {
  ApplicationGraphIR,
  DependencyEdgeIR,
  DependencyNodeIR,
  LayerIR,
} from '@loutrejs/graph'
import { checkCapabilities, type RuntimeCapabilities } from '@loutrejs/runtime'
import { bunRuntime } from '@loutrejs/runtime-bun'
import { denoRuntime } from '@loutrejs/runtime-deno'
import { electronRuntime } from '@loutrejs/runtime-electron'
import { lambdaRuntime } from '@loutrejs/runtime-lambda'
import { createNodeHttpServer, nodeRuntime } from '@loutrejs/runtime-node'
import { workerdRuntime } from '@loutrejs/runtime-workerd'
import type { HttpApplication } from '@loutrejs/http'
import {
  emitApplication,
  importHttpApplication,
  loadApplicationGraph,
  loadHttpApplication,
} from './application-loader.js'
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

export async function runCli(args: readonly string[], io: CliIO): Promise<number> {
  const [command, subject] = args
  if (!command || command === 'help' || command === '--help') {
    io.stdout(helpText())
    return 0
  }

  const entry = () => {
    const requested = readOption(args, '--entry')
    if (!requested) {
      io.stderr(`${command}には--entry <明示entry>が必要です。filesystem discoveryは行いません。`)
      return undefined
    }
    return resolve(io.cwd, requested)
  }

  switch (command) {
    case 'check': {
      const target = entry()
      if (!target) return 2
      const graph = await loadApplicationGraph(target)
      if (graph.diagnostics.length === 0) {
        io.stdout('Loutre Application Graphは有効です。')
        return 0
      }
      writeDiagnostics(graph, io)
      return 1
    }
    case 'doctor': {
      const runtimeName = subject ?? 'node'
      const runtime = runtimes[runtimeName]
      if (!runtime) {
        io.stderr(`未定義のRuntimeです: ${runtimeName}`)
        return 2
      }
      const target = entry()
      if (!target) return 2
      const graph = await loadApplicationGraph(target)
      const required = requiredCapabilities(graph)
      const check = checkCapabilities(required, runtime)
      io.stdout(`Runtime: ${runtime.runtime}`)
      io.stdout(`Required: ${check.required.join(', ') || '(なし)'}`)
      io.stdout(`Missing: ${check.missing.join(', ') || '(なし)'}`)
      if (graph.diagnostics.length > 0) writeDiagnostics(graph, io)
      return check.ok && graph.diagnostics.length === 0 ? 0 : 1
    }
    case 'graph': {
      if (!isGraphSubject(subject)) {
        io.stderr('graphにはmodules、di、contracts、runtimeのいずれかが必要です。')
        return 2
      }
      const target = entry()
      if (!target) return 2
      const graph = await loadApplicationGraph(target)
      const format = readOption(args, '--format') ?? 'text'
      if (!['text', 'json', 'mermaid'].includes(format)) {
        io.stderr('graph --formatにはtext、json、mermaidのいずれかを指定してください。')
        return 2
      }
      if (format === 'json') io.stdout(`${JSON.stringify(graphData(graph, subject), null, 2)}\n`)
      else if (format === 'mermaid') io.stdout(renderMermaidGraph(graph, subject))
      else renderTextGraph(graph, subject, io.stdout)
      if (graph.diagnostics.length > 0) writeDiagnostics(graph, io)
      return graph.diagnostics.length === 0 ? 0 : 1
    }
    case 'explain': {
      if (!subject) {
        io.stderr('explainには対象が必要です。')
        return 2
      }
      const target = entry()
      if (!target) return 2
      const graph = await loadApplicationGraph(target)
      if (!renderExplanation(graph, subject, io.stdout)) {
        io.stderr(`対象が見つかりません: ${subject}`)
        return 1
      }
      if (graph.diagnostics.length > 0) writeDiagnostics(graph, io)
      return graph.diagnostics.length === 0 ? 0 : 1
    }
    case 'build': {
      if (!subject) {
        io.stderr('buildには明示的なApplication entryが必要です。')
        return 2
      }
      const applicationEntry = resolve(io.cwd, subject)
      const graph = await loadApplicationGraph(applicationEntry)
      if (graph.diagnostics.length > 0) {
        writeDiagnostics(graph, io)
        return 1
      }
      const outputDirectory = resolve(io.cwd, readOption(args, '--out-dir') ?? 'dist/loutre')
      await mkdir(outputDirectory, { recursive: true })
      const applicationOutput = join(outputDirectory, 'application.mjs')
      await emitApplication(applicationEntry, applicationOutput)
      const fingerprint = createHash('sha256').update(JSON.stringify(graph)).digest('hex')
      const manifestOutput = join(outputDirectory, 'loutre.manifest.json')
      await writeFile(
        manifestOutput,
        `${JSON.stringify({ ...graph, fingerprint }, null, 2)}\n`,
        'utf8',
      )
      io.stdout(`Applicationを出力しました: ${applicationOutput}`)
      io.stdout(`Graph Manifestを出力しました: ${manifestOutput}`)
      return 0
    }
    case 'dev': {
      if (!subject) {
        io.stderr('devには明示的なApplication entryが必要です。filesystem discoveryは行いません。')
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
        io.stderr('startには明示的なApplication entryが必要です。filesystem discoveryは行いません。')
        return 2
      }
      const startedAt = performance.now()
      const [applicationName, frameworkVersion, loaded] = await Promise.all([
        readApplicationName(io.cwd),
        readFrameworkVersion(),
        loadHttpApplication(resolve(io.cwd, subject)),
      ])
      await loaded.application.initialize()
      await listen(loaded.application, readPort(args), io, {
        application: applicationName,
        version: frameworkVersion,
        environment: process.env.NODE_ENV ?? 'production',
        startedAt,
      })
      return 0
    }
    default:
      io.stderr(`不明なcommandです: ${command}`)
      return 2
  }
}

function isGraphSubject(value: string | undefined): value is 'modules' | 'di' | 'contracts' | 'runtime' {
  return value === 'modules' || value === 'di' || value === 'contracts' || value === 'runtime'
}

function writeDiagnostics(graph: ApplicationGraphIR, io: CliIO): void {
  for (const diagnostic of graph.diagnostics) {
    io.stderr(`${diagnostic.code} ${diagnostic.path}\n${diagnostic.message}`)
  }
}

function graphData(
  graph: ApplicationGraphIR,
  subject: 'modules' | 'di' | 'contracts' | 'runtime',
): unknown {
  switch (subject) {
    case 'modules':
      return { version: graph.version, modules: graph.modules, diagnostics: graph.diagnostics }
    case 'di':
      return { version: graph.version, nodes: graph.nodes, edges: graph.edges, diagnostics: graph.diagnostics }
    case 'contracts':
      return {
        version: graph.version,
        contracts: graph.contracts,
        pipelines: graph.pipelines,
        implementations: graph.implementations,
        diagnostics: graph.diagnostics,
      }
    case 'runtime':
      return { version: graph.version, capabilities: graph.capabilities, diagnostics: graph.diagnostics }
  }
}

function renderTextGraph(
  graph: ApplicationGraphIR,
  subject: 'modules' | 'di' | 'contracts' | 'runtime',
  write: (value: string) => void,
): void {
  if (subject === 'modules') {
    for (const module of graph.modules) {
      write(module.name === undefined ? module.id : `${module.name} [${module.id}]`)
      if (module.description !== undefined) write(`  description: ${module.description}`)
      write(`  imports: ${module.imports.join(', ') || '(なし)'}`)
      write(`  providers: ${module.providers.join(', ') || '(なし)'}`)
      write(`  exports: ${module.exports.join(', ') || '(なし)'}`)
      write(`  lifecycle: ${module.lifecycle.join(', ') || '(なし)'}`)
      write(`  requires: ${module.requires.join(', ') || '(なし)'}`)
    }
    return
  }
  if (subject === 'contracts') {
    for (const pipeline of graph.pipelines) {
      write(`${pipeline.contract}.${pipeline.procedure} [${pipeline.protocol}]`)
      renderLayerText(pipeline.layers, write)
    }
    return
  }
  if (subject === 'runtime') {
    for (const capability of requiredCapabilities(graph)) write(capability)
    return
  }
  renderDiText(graph, write)
}

function renderDiText(graph: ApplicationGraphIR, write: (value: string) => void): void {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  const outgoing = new Map<string, DependencyEdgeIR[]>()
  const incoming = new Set(graph.edges.map((edge) => edge.to))
  for (const edge of graph.edges) {
    const current = outgoing.get(edge.from) ?? []
    current.push(edge)
    outgoing.set(edge.from, current)
  }
  const renderedRoots = new Set<string>()
  const render = (id: string, prefix: string, lineage: readonly string[]) => {
    const edges = outgoing.get(id) ?? []
    edges.forEach((edge, index) => {
      const child = byId.get(edge.to)
      if (!child) return
      const last = index === edges.length - 1
      const cycle = lineage.includes(edge.to)
      const condition = edge.condition
        ? ` [${edge.condition.key}=${String(edge.condition.equals)}]`
        : ''
      const unresolved = graph.diagnostics.some(
        (diagnostic) => diagnostic.code === 'LUTRE_DI_UNRESOLVED' && diagnostic.message.includes(child.label),
      )
      write(`${prefix}${last ? '└──' : '├──'}${condition} ${nodeLabel(child)}${cycle ? ' ↺ cycle' : unresolved ? ' ✗ UNRESOLVED' : ''}`)
      if (!cycle) render(edge.to, `${prefix}${last ? '    ' : '│   '}`, [...lineage, edge.to])
    })
  }
  const roots = graph.nodes.filter((node) => !incoming.has(node.id) && (outgoing.get(node.id)?.length ?? 0) > 0)
  for (const root of roots) {
    renderedRoots.add(root.id)
    write(nodeLabel(root))
    render(root.id, '', [root.id])
  }
  for (const node of graph.nodes) {
    if (renderedRoots.has(node.id) || (outgoing.get(node.id)?.length ?? 0) === 0) continue
    write(nodeLabel(node))
    render(node.id, '', [node.id])
  }
  if (graph.nodes.length === 0) write('(DI nodeなし)')
}

function nodeLabel(node: DependencyNodeIR): string {
  const attributes = [node.kind, node.scope].filter(Boolean).join(', ')
  return `${node.label}${attributes ? ` [${attributes}]` : ''}`
}

function renderMermaidGraph(
  graph: ApplicationGraphIR,
  subject: 'modules' | 'di' | 'contracts' | 'runtime',
): string {
  const lines = ['flowchart LR']
  const node = (id: string, label: string) => {
    lines.push(`  ${id}["${mermaidText(label)}"]`)
  }
  const edge = (from: string, to: string, label?: string) => {
    lines.push(
      `  ${from} -->${label ? `|"${mermaidText(label)}"|` : ''} ${to}`,
    )
  }
  if (subject === 'di') {
    const ids = new Map(graph.nodes.map((candidate, index) => [candidate.id, `n${index}`]))
    for (const candidate of graph.nodes) {
      node(ids.get(candidate.id)!, nodeLabel(candidate))
    }
    for (const dependency of graph.edges) {
      const condition = dependency.condition
        ? `${dependency.kind}: ${dependency.condition.key}=${String(dependency.condition.equals)}`
        : `${dependency.kind}/${dependency.source}`
      edge(
        ids.get(dependency.from) ?? mermaidId(dependency.from),
        ids.get(dependency.to) ?? mermaidId(dependency.to),
        condition,
      )
    }
  } else if (subject === 'modules') {
    const ids = new Map(graph.modules.map((module, index) => [module.id, `m${index}`]))
    for (const module of graph.modules) {
      node(ids.get(module.id)!, module.name ?? module.description ?? module.id)
      for (const imported of module.imports) {
        edge(ids.get(module.id)!, ids.get(imported) ?? mermaidId(imported))
      }
    }
  } else if (subject === 'contracts') {
    graph.pipelines.forEach((pipeline, pipelineIndex) => {
      const procedure = `${pipeline.contract}.${pipeline.procedure} [${pipeline.protocol}]`
      const procedureId = `p${pipelineIndex}`
      node(procedureId, procedure)
      renderLayerMermaid(
        pipeline.layers,
        `p${pipelineIndex}`,
        procedureId,
        node,
        edge,
      )
    })
  } else {
    node('application', 'Application')
    requiredCapabilities(graph).forEach((capability, index) => {
      const capabilityId = `capability${index}`
      node(capabilityId, capability)
      edge('application', capabilityId)
    })
  }
  return lines.join('\n')
}

function renderExplanation(
  graph: ApplicationGraphIR,
  subject: string,
  write: (value: string) => void,
): boolean {
  const node = graph.nodes.find((candidate) => candidate.label === subject || candidate.id === subject)
  const pipelines = graph.pipelines.filter(
    (pipeline) => `${pipeline.contract}.${pipeline.procedure}` === subject || pipeline.contract === subject,
  )
  if (!node && pipelines.length === 0) return false
  for (const pipeline of pipelines) {
    write(`${pipeline.contract}.${pipeline.procedure} [${pipeline.protocol}]`)
    renderLayerText(pipeline.layers, write, '')
  }
  if (node) {
    write(node.label)
    write(`kind: ${node.kind}`)
    if (node.scope) write(`scope: ${node.scope}`)
    if (node.module) write(`managed by: ${node.module}`)
    const edges = graph.edges.filter((edge) => edge.from === node.id)
    write('dependencies:')
    if (edges.length === 0) write('  (なし)')
    for (const edge of edges) {
      const dependency = graph.nodes.find((candidate) => candidate.id === edge.to)
      if (!dependency) continue
      write(`  ${dependency.label}`)
      write(`    source: ${edge.kind}/${edge.source}`)
      if (dependency.scope) write(`    scope: ${dependency.scope}`)
      if (dependency.module) write(`    provided by: ${dependency.module}`)
    }
  }
  return true
}

function renderLayerText(
  layers: readonly LayerIR[],
  write: (value: string) => void,
  indent = '  ',
): void {
  for (const current of layers) {
    write(`${indent}${current.index + 1} ${current.name} ${current.role}`)
    if (current.pipeline) {
      renderLayerText(current.pipeline, write, `${indent}  `)
    }
  }
}

function renderLayerMermaid(
  layers: readonly LayerIR[],
  idPrefix: string,
  parentId: string,
  node: (id: string, label: string) => void,
  edge: (from: string, to: string, label?: string) => void,
): string {
  let previous = parentId
  for (const current of layers) {
    const currentId = `${idPrefix}l${current.index}`
    node(currentId, `${current.index + 1} ${current.name}`)
    edge(previous, currentId)
    if (current.pipeline) {
      renderLayerMermaid(
        current.pipeline,
        `${currentId}c`,
        currentId,
        node,
        edge,
      )
    }
    previous = currentId
  }
  return previous
}

function requiredCapabilities(graph: ApplicationGraphIR): string[] {
  return [...new Set(graph.capabilities.map(({ name }) => name))]
}

function mermaidId(value: string): string {
  return `generated_${value.replace(/[^A-Za-z0-9_]/gu, '_')}`
}

function mermaidText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

interface DevelopmentBuild {
  readonly application: HttpApplication
  readonly sourceFiles: readonly string[]
}

async function startDevelopmentServer(
  entry: string,
  tsconfigPath: string,
  port: number,
  io: CliIO,
): Promise<number> {
  const directory = await mkdtemp(join(tmpdir(), 'loutre-dev-'))
  let generation = 0
  let listenPort = port
  let active: { readonly application: HttpApplication; readonly server: Server } | undefined
  const [applicationName, frameworkVersion] = await Promise.all([
    readApplicationName(io.cwd),
    readFrameworkVersion(),
  ])

  const build = async (): Promise<DevelopmentBuild> => {
    await runTypeCheck(tsconfigPath)
    const output = join(directory, `application-${generation++}.mjs`)
    const sourceFiles = await emitApplication(entry, output, {
      nodeCompatibility: true,
    })
    return { application: await importHttpApplication(output), sourceFiles }
  }
  const launch = async (candidate: DevelopmentBuild, startedAt: number) => {
    await candidate.application.initialize()
    const server = createNodeHttpServer(candidate.application, {
      onListening: (url) => writeStartupBanner(io, {
        application: applicationName,
        version: frameworkVersion,
        server: url,
        environment: process.env.NODE_ENV ?? 'development',
        startedAt,
      }),
    })
    server.listen(listenPort, '127.0.0.1')
    await waitForListening(server)
    const address = server.address()
    if (listenPort === 0 && typeof address === 'object' && address) listenPort = address.port
    active = { application: candidate.application, server }
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

  const first = await build()
  await launch(first, performance.now())
  let stopping = false
  let reloading = false
  let pending = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let activeReload: Promise<void> | undefined
  const watcher = new SourceWatchSet(() => {
    if (stopping) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(requestReload, 75)
  })
  watcher.replace([...first.sourceFiles, tsconfigPath])

  function requestReload() {
    timer = undefined
    if (stopping) return
    if (reloading) {
      pending = true
      return
    }
    activeReload = reload().finally(() => { activeReload = undefined })
  }

  async function reload(): Promise<void> {
    reloading = true
    try {
      do {
        pending = false
        let candidate: DevelopmentBuild | undefined
        try {
          await stop('reload')
          candidate = await build()
          if (stopping) {
            await candidate.application.shutdown('dev-server-shutdown')
            return
          }
          await launch(candidate, performance.now())
          watcher.replace([...candidate.sourceFiles, tsconfigPath])
          candidate = undefined
        } catch (error) {
          if (candidate) await candidate.application.shutdown('reload-error').catch(() => undefined)
          io.stderr(`Applicationの再起動に失敗しました。Applicationは停止しています。\n${errorMessage(error)}`)
        }
      } while (pending && !stopping)
    } finally {
      reloading = false
    }
  }

  const shutdown = async (signal: string) => {
    if (stopping) return
    stopping = true
    if (timer) clearTimeout(timer)
    watcher.close()
    await activeReload
    await stop(signal)
    await rm(directory, { recursive: true, force: true })
  }
  const report = (error: unknown) => io.stderr(`Development serverの終了処理に失敗しました: ${errorMessage(error)}`)
  process.once('SIGINT', () => void shutdown('SIGINT').catch(report))
  process.once('SIGTERM', () => void shutdown('SIGTERM').catch(report))
  return 0
}

async function runTypeCheck(tsconfigPath: string): Promise<void> {
  await new Promise<void>((resolveCheck, reject) => {
    const child = spawn('tsc', ['-p', tsconfigPath, '--noEmit', '--pretty', 'false'], {
      cwd: dirname(tsconfigPath),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', (chunk) => { output += chunk.toString() })
    child.stderr.on('data', (chunk) => { output += chunk.toString() })
    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) resolveCheck()
      else reject(new Error(output.trim() || `TypeScript type checkが終了code ${code}で失敗しました`))
    })
  })
}

class SourceWatchSet {
  readonly #watchers = new Map<string, FSWatcher>()
  readonly #versions = new Map<string, string>()

  constructor(readonly onChange: () => void) {}

  add(paths: readonly string[]): void {
    const targets = new Map<string, boolean>()
    for (const requested of paths) {
      const absolute = resolve(requested)
      this.#versions.set(absolute, sourceVersion(absolute))
      targets.set(absolute, targets.get(absolute) ?? false)
      targets.set(dirname(absolute), true)
    }
    for (const [path, directory] of targets) {
      if (this.#watchers.has(path) || !existsSync(path)) continue
      const watcher = watchFile(path, (_event, fileName) => {
        const changed = directory && fileName ? resolve(path, fileName.toString()) : path
        if (!/\.(?:[cm]?[jt]sx?|json)$/.test(changed)) return
        const version = sourceVersion(changed)
        if (this.#versions.get(changed) === version) return
        this.#versions.set(changed, version)
        this.onChange()
      })
      watcher.on('error', () => {
        watcher.close()
        this.#watchers.delete(path)
        this.onChange()
      })
      this.#watchers.set(path, watcher)
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
}

function sourceVersion(path: string): string {
  try {
    const stats = statSync(path, { bigint: true })
    return [stats.dev, stats.ino, stats.size, stats.mtimeNs, stats.ctimeNs].join(':')
  } catch {
    return 'missing'
  }
}

async function listen(
  application: HttpApplication,
  port: number,
  io: CliIO,
  details: { readonly application: string; readonly version: string; readonly environment: string; readonly startedAt: number },
): Promise<void> {
  const server = createNodeHttpServer(application, {
    onListening: (url) => writeStartupBanner(io, { ...details, server: url }),
  })
  server.listen(port, '127.0.0.1')
  await waitForListening(server)
  const shutdown = async (signal: string) => {
    await closeServer(server)
    await application.shutdown(signal)
  }
  process.once('SIGINT', () => void shutdown('SIGINT'))
  process.once('SIGTERM', () => void shutdown('SIGTERM'))
}

async function waitForListening(server: Server): Promise<void> {
  await new Promise<void>((resolveListening, reject) => {
    server.once('listening', resolveListening)
    server.once('error', reject)
  })
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolveClosed, reject) => {
    server.close((error) => error ? reject(error) : resolveClosed())
  })
}

function writeStartupBanner(
  io: CliIO,
  details: { readonly application: string; readonly version: string; readonly server: string; readonly environment: string; readonly startedAt: number },
): void {
  printStartupBanner({
    application: details.application,
    version: details.version,
    server: details.server,
    runtime: `Node.js ${process.versions.node}`,
    environment: details.environment,
    startupDurationMs: performance.now() - details.startedAt,
  }, io.terminal ?? { isTTY: false, color: false }, io.stdout)
}

async function readApplicationName(cwd: string): Promise<string> {
  try {
    const manifest = JSON.parse(await readFile(resolve(cwd, 'package.json'), 'utf8')) as { readonly name?: unknown }
    if (typeof manifest.name === 'string' && manifest.name.length > 0) return manifest.name.split('/').at(-1) ?? manifest.name
  } catch {
    // package.jsonがないApplicationではdirectory名を使用する。
  }
  return basename(cwd)
}

async function readFrameworkVersion(): Promise<string> {
  try {
    const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as { readonly version?: unknown }
    if (typeof manifest.version === 'string') return manifest.version
  } catch {
    // package metadataを読めない実行形態ではunknownを表示する。
  }
  return 'unknown'
}

function readOption(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name)
  return index < 0 ? undefined : args[index + 1]
}

function readPort(args: readonly string[]): number {
  const value = readOption(args, '--port')
  if (value === undefined) return 3000
  const port = Number(value)
  if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error(`不正なportです: ${value}`)
  return port
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function helpText(): string {
  return [
    'Loutre CLI',
    '  loutre check --entry <明示entry>',
    '  loutre doctor [node|deno|bun|workerd|electron|lambda] --entry <明示entry>',
    '  loutre graph modules|di|contracts|runtime --entry <明示entry> [--format text|json|mermaid]',
    '  loutre explain <target> --entry <明示entry>',
    '  loutre build <明示entry> [--out-dir <directory>]',
    '  loutre dev <明示entry> [--port <port>]',
    '  loutre start <明示entry> [--port <port>]',
  ].join('\n')
}
