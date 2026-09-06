import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type {
  ApplicationModelGraphIR,
  GraphEdgeIR,
  GraphNodeIR,
  JsonValue,
} from '@loutrejs/loutre/graph'
import {
  checkCapabilities,
  detectRuntimeEngine,
  nodeRuntimeCapabilities,
  type RuntimeCapabilities,
} from '@loutrejs/loutre/runtime'
import { bunRuntime } from '@loutrejs/loutre/runtime/bun'
import { denoRuntime } from '@loutrejs/loutre/runtime/deno'
import { electronRuntime } from '@loutrejs/loutre/runtime/electron'
import { awsLambdaRuntime } from '@loutrejs/loutre/runtime/aws-lambda'
import { cloudflareWorkersRuntime } from '@loutrejs/loutre/runtime/cloudflare-workers'
import { emitApplication, loadApplicationGraph } from './application-loader.js'

export interface CliIO {
  readonly cwd: string
  readonly stdout: (value: string) => void
  readonly stderr: (value: string) => void
}

const runtimes: Readonly<Record<string, RuntimeCapabilities>> = {
  node: nodeRuntimeCapabilities,
  deno: denoRuntime,
  bun: bunRuntime,
  'cloudflare-workers': cloudflareWorkersRuntime,
  electron: electronRuntime,
  'aws-lambda': awsLambdaRuntime,
}

const runtimeNames = Object.keys(runtimes)
const deploymentRuntimes = ['aws-lambda', 'cloudflare-workers', 'deno'] as const
type DeploymentRuntime = (typeof deploymentRuntimes)[number]
type GraphSubject = 'modules' | 'di' | 'contracts' | 'runtime' | 'executions'

export async function runCli(
  args: readonly string[],
  io: CliIO,
): Promise<number> {
  const [command, subject] = readPositionals(args)
  if (
    !command ||
    command === 'help' ||
    command === '--help' ||
    command === '-h'
  ) {
    io.stdout(helpText())
    return 0
  }

  const entry = () => {
    const requested = readOption(args, '--entry')
    if (!requested) {
      io.stderr(
        `${command} requires --entry <entry>. Filesystem discovery is not supported.`,
      )
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
        io.stdout('Loutre Application Model is valid.')
        return 0
      }
      writeDiagnostics(graph, io)
      return 1
    }

    case 'doctor': {
      if (subject) {
        io.stderr(`Unexpected argument: ${subject}`)
        return 2
      }
      const runtimeOption = readOption(args, '--runtime')
      const runtimeName = runtimeOption ?? detectRuntimeEngine()
      const runtime = runtimes[runtimeName]
      if (!runtime) {
        io.stderr(
          runtimeOption
            ? `doctor --runtime must be one of: ${runtimeNames.join(', ')}.`
            : 'Could not detect the current runtime. Use --runtime <runtime>.',
        )
        return 2
      }
      const target = entry()
      if (!target) return 2
      const graph = await loadApplicationGraph(target)
      const required = requiredCapabilities(graph)
      const check = checkCapabilities(required, runtime)
      io.stdout(`Runtime: ${runtime.runtime}`)
      io.stdout(`Required: ${check.required.join(', ') || '(none)'}`)
      io.stdout(`Missing: ${check.missing.join(', ') || '(none)'}`)
      renderApplicationSummary(graph, io.stdout)
      renderCapabilityReasons(graph, check.missing, io.stdout)
      if (graph.diagnostics.length > 0) writeDiagnostics(graph, io)
      return check.ok && graph.diagnostics.length === 0 ? 0 : 1
    }

    case 'graph': {
      if (!isGraphSubject(subject)) {
        io.stderr(
          'graph requires one of: modules, di, contracts, executions, runtime.',
        )
        return 2
      }
      const target = entry()
      if (!target) return 2
      const graph = await loadApplicationGraph(target)
      const format = readOption(args, '--format') ?? 'text'
      if (!['text', 'json', 'mermaid'].includes(format)) {
        io.stderr('graph --format must be one of: text, json, mermaid.')
        return 2
      }
      if (format === 'json') {
        io.stdout(`${JSON.stringify(graphData(graph, subject), null, 2)}\n`)
      } else if (format === 'mermaid') {
        io.stdout(renderMermaidGraph(graph, subject))
      } else {
        renderTextGraph(graph, subject, io.stdout)
      }
      if (graph.diagnostics.length > 0) writeDiagnostics(graph, io)
      return graph.diagnostics.length === 0 ? 0 : 1
    }

    case 'explain': {
      if (!subject) {
        io.stderr('explain requires a target.')
        return 2
      }
      const target = entry()
      if (!target) return 2
      const graph = await loadApplicationGraph(target)
      if (!renderExplanation(graph, subject, io.stdout)) {
        io.stderr(`Target not found: ${subject}`)
        return 1
      }
      if (graph.diagnostics.length > 0) writeDiagnostics(graph, io)
      return graph.diagnostics.length === 0 ? 0 : 1
    }

    case 'build': {
      if (!subject) {
        io.stderr('build requires an explicit Application entry.')
        return 2
      }
      const runtimeOption = readOption(args, '--runtime')
      const deploymentRuntime = runtimeOption
        ? parseDeploymentRuntime(runtimeOption)
        : undefined
      if (runtimeOption && !deploymentRuntime) {
        io.stderr(
          `build --runtime must be one of: ${deploymentRuntimes.join(', ')}.`,
        )
        return 2
      }
      const applicationEntry = resolve(io.cwd, subject)
      const graph = await loadApplicationGraph(applicationEntry)
      if (graph.diagnostics.length > 0) {
        writeDiagnostics(graph, io)
        return 1
      }
      if (deploymentRuntime && !hasHttpExecution(graph)) {
        io.stderr(
          `Runtime ${deploymentRuntime} entry generation requires an HTTP-capable Application.`,
        )
        return 1
      }
      if (deploymentRuntime) {
        const compatibility = checkCapabilities(
          requiredCapabilities(graph),
          runtimes[deploymentRuntime]!,
        )
        if (!compatibility.ok) {
          io.stderr(
            `Runtime ${deploymentRuntime} is missing: ${compatibility.missing.join(', ')}`,
          )
          renderCapabilityReasons(graph, compatibility.missing, io.stderr)
          return 1
        }
      }
      renderApplicationSummary(graph, io.stdout, deploymentRuntime)
      const outputDirectory = resolve(
        io.cwd,
        readOption(args, '--out-dir') ?? 'dist/loutre',
      )
      await mkdir(outputDirectory, { recursive: true })
      const applicationOutput = join(outputDirectory, 'application.mjs')
      await emitApplication(applicationEntry, applicationOutput)
      io.stdout(`Wrote Application: ${applicationOutput}`)
      if (deploymentRuntime) {
        const deploymentOutput = join(outputDirectory, 'entry.mjs')
        await writeFile(
          deploymentOutput,
          renderDeploymentEntry(deploymentRuntime),
          'utf8',
        )
        io.stdout(`Wrote runtime entry: ${deploymentOutput}`)
      }
      return 0
    }

    default:
      io.stderr(`Unknown command: ${command}`)
      return 2
  }
}

function parseDeploymentRuntime(value: string): DeploymentRuntime | undefined {
  return deploymentRuntimes.find((runtime) => runtime === value)
}

function hasHttpExecution(graph: ApplicationModelGraphIR): boolean {
  return graph.executions.some(
    (execution) => execution.executionKind === 'http.request',
  )
}

function renderDeploymentEntry(runtime: DeploymentRuntime): string {
  switch (runtime) {
    case 'aws-lambda':
      return [
        "import application from './application.mjs'",
        "import { awsLambdaRuntime } from '@loutrejs/loutre/runtime/aws-lambda'",
        '',
        'export const handler = awsLambdaRuntime.bind({ application })',
        '',
      ].join('\n')
    case 'cloudflare-workers':
      return [
        "import application from './application.mjs'",
        "import { cloudflareWorkersRuntime } from '@loutrejs/loutre/runtime/cloudflare-workers'",
        '',
        'export default cloudflareWorkersRuntime.bind({ application })',
        '',
      ].join('\n')
    case 'deno':
      return [
        "import application from './application.mjs'",
        "import { denoRuntime } from '@loutrejs/loutre/runtime/deno'",
        '',
        'export default denoRuntime.bind({ application })',
        '',
      ].join('\n')
  }
}

function isGraphSubject(value: string | undefined): value is GraphSubject {
  return (
    value === 'modules' ||
    value === 'di' ||
    value === 'contracts' ||
    value === 'runtime' ||
    value === 'executions'
  )
}

function writeDiagnostics(graph: ApplicationModelGraphIR, io: CliIO): void {
  for (const diagnostic of graph.diagnostics) {
    io.stderr(`${diagnostic.code} ${diagnostic.path}\n${diagnostic.message}`)
  }
}

function graphData(
  graph: ApplicationModelGraphIR,
  subject: GraphSubject,
): unknown {
  switch (subject) {
    case 'modules':
      return {
        modules: graph.modules.map((module) => moduleData(graph, module)),
        diagnostics: graph.diagnostics,
      }
    case 'di':
      return {
        nodes: graph.nodes,
        edges: graph.edges,
        diagnostics: graph.diagnostics,
      }
    case 'contracts':
      return {
        executions: httpExecutions(graph),
        routes: httpRoutes(graph),
        diagnostics: graph.diagnostics,
      }
    case 'runtime':
      return {
        capabilities: requiredCapabilities(graph),
        diagnostics: graph.diagnostics,
      }
    case 'executions':
      return {
        executions: graph.executions,
        diagnostics: graph.diagnostics,
      }
  }
}

function renderTextGraph(
  graph: ApplicationModelGraphIR,
  subject: GraphSubject,
  write: (value: string) => void,
): void {
  if (subject === 'modules') {
    for (const module of graph.modules) {
      const data = moduleData(graph, module)
      write(
        module.name === undefined ? module.id : `${module.name} [${module.id}]`,
      )
      const description = stringAttribute(module, 'description')
      if (description !== undefined) write(`  description: ${description}`)
      write(`  imports: ${data.imports.join(', ') || '(none)'}`)
      write(`  providers: ${data.providers.join(', ') || '(none)'}`)
      write(`  executions: ${data.executions.join(', ') || '(none)'}`)
    }
    return
  }

  if (subject === 'contracts') {
    for (const route of httpRoutes(graph)) {
      write(`${route.execution}.${route.name} [http]`)
      write(`  ${route.method} ${route.path}`)
    }
    if (httpRoutes(graph).length === 0) write('(no HTTP executions)')
    return
  }

  if (subject === 'runtime') {
    for (const capability of requiredCapabilities(graph)) write(capability)
    if (requiredCapabilities(graph).length === 0) write('(none)')
    return
  }

  if (subject === 'executions') {
    for (const execution of graph.executions) {
      write(`${execution.executionKind}: ${execution.name ?? execution.id}`)
    }
    if (graph.executions.length === 0) write('(no executions)')
    return
  }

  renderDiText(graph, write)
}

function renderDiText(
  graph: ApplicationModelGraphIR,
  write: (value: string) => void,
): void {
  const relevant = graph.nodes.filter(
    (node) => node.kind === 'provider' || node.kind === 'execution',
  )
  const ids = new Set(relevant.map((node) => node.id))
  const edges = graph.edges.filter(
    (edge) => edge.kind === 'injects' && ids.has(edge.from) && ids.has(edge.to),
  )
  const byId = new Map(relevant.map((node) => [node.id, node]))
  const outgoing = groupEdges(edges)
  const incoming = new Set(edges.map((edge) => edge.to))
  const roots = relevant.filter(
    (node) =>
      !incoming.has(node.id) && (outgoing.get(node.id)?.length ?? 0) > 0,
  )
  const rendered = new Set<string>()

  const render = (id: string, prefix: string, lineage: readonly string[]) => {
    for (const [index, edge] of (outgoing.get(id) ?? []).entries()) {
      const child = byId.get(edge.to)
      if (!child) continue
      const last = index === (outgoing.get(id)?.length ?? 0) - 1
      const cycle = lineage.includes(edge.to)
      rendered.add(child.id)
      write(
        `${prefix}${last ? '└──' : '├──'} ${nodeLabel(child)}${cycle ? ' ↺ cycle' : ''}`,
      )
      if (!cycle) {
        render(edge.to, `${prefix}${last ? '    ' : '│   '}`, [
          ...lineage,
          edge.to,
        ])
      }
    }
  }

  for (const root of roots) {
    rendered.add(root.id)
    write(nodeLabel(root))
    render(root.id, '', [root.id])
  }
  for (const node of relevant) {
    if (rendered.has(node.id)) continue
    rendered.add(node.id)
    write(nodeLabel(node))
    render(node.id, '', [node.id])
  }
  if (relevant.length === 0) write('(no DI nodes)')
}

function renderMermaidGraph(
  graph: ApplicationModelGraphIR,
  subject: GraphSubject,
): string {
  const lines = ['flowchart LR']
  const node = (id: string, label: string) =>
    lines.push(`  ${id}["${mermaidText(label)}"]`)
  const edge = (from: string, to: string, label?: string) =>
    lines.push(`  ${from} -->${label ? `|"${mermaidText(label)}"|` : ''} ${to}`)

  if (subject === 'contracts') {
    httpRoutes(graph).forEach((route, index) => {
      node(`r${index}`, `${route.method} ${route.path}`)
      node(`e${index}`, route.execution)
      edge(`e${index}`, `r${index}`, route.name)
    })
    return lines.join('\n')
  }

  const selected = selectNodes(graph, subject)
  const selectedIds = new Set(selected.map((candidate) => candidate.id))
  const ids = new Map(
    selected.map((candidate, index) => [candidate.id, `n${index}`]),
  )
  for (const candidate of selected) {
    node(ids.get(candidate.id)!, nodeLabel(candidate))
  }
  for (const dependency of graph.edges) {
    if (!selectedIds.has(dependency.from) || !selectedIds.has(dependency.to))
      continue
    edge(ids.get(dependency.from)!, ids.get(dependency.to)!, dependency.kind)
  }
  return lines.join('\n')
}

function renderExplanation(
  graph: ApplicationModelGraphIR,
  subject: string,
  write: (value: string) => void,
): boolean {
  const node = graph.nodes.find(
    (candidate) => candidate.name === subject || candidate.id === subject,
  )
  if (!node) return false

  write(nodeLabel(node))
  write(`kind: ${node.kind}`)
  if (node.module) write(`managed by: ${node.module}`)
  if (node.executionKind) write(`execution: ${node.executionKind}`)
  if (node.extension) write(`extension: ${node.extension.name}`)
  for (const [key, value] of Object.entries(node.attributes ?? {})) {
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      write(`${key}: ${String(value)}`)
    }
  }
  const edges = graph.edges.filter((edge) => edge.from === node.id)
  write('dependencies:')
  const dependencies = edges.filter((edge) => edge.kind === 'injects')
  if (dependencies.length === 0) write('  (none)')
  for (const dependency of dependencies) {
    const target = graph.nodes.find(
      (candidate) => candidate.id === dependency.to,
    )
    if (target) write(`  ${nodeLabel(target)}`)
  }
  write('dependency graph:')
  renderDependencyTree(graph, node.id, write, '  ', new Set([node.id]))
  return true
}

function renderDependencyTree(
  graph: ApplicationModelGraphIR,
  nodeId: string,
  write: (value: string) => void,
  indent: string,
  lineage: ReadonlySet<string>,
): void {
  const edges = graph.edges.filter(
    (edge) => edge.from === nodeId && edge.kind === 'injects',
  )
  if (edges.length === 0) {
    write(`${indent}(none)`)
    return
  }
  for (const edge of edges) {
    const dependency = graph.nodes.find((candidate) => candidate.id === edge.to)
    if (!dependency) continue
    const cycle = lineage.has(dependency.id)
    write(`${indent}${nodeLabel(dependency)}${cycle ? ' (cycle)' : ''}`)
    if (cycle) continue
    renderDependencyTree(
      graph,
      dependency.id,
      write,
      `${indent}  `,
      new Set([...lineage, dependency.id]),
    )
  }
}

function renderApplicationSummary(
  graph: ApplicationModelGraphIR,
  write: (value: string) => void,
  target?: string,
): void {
  write('Application:')
  if (target) write(`  Target: ${target}`)
  write(`  Graph: ${graph.diagnostics.length === 0 ? 'valid' : 'invalid'}`)
  write(`  Modules: ${graph.modules.length}`)
  write(`  Providers: ${graph.providers.length}`)
  write(`  Executions: ${graph.executions.length}`)
  write(`  Diagnostics: ${graph.diagnostics.length}`)
}

function renderCapabilityReasons(
  graph: ApplicationModelGraphIR,
  capabilities: readonly string[],
  write: (value: string) => void,
): void {
  if (capabilities.length === 0) return
  write('Capability reasons:')
  for (const capability of capabilities) {
    const requiredBy = graph.executions
      .filter((execution) => execution.capabilities?.includes(capability))
      .map((execution) => execution.name ?? execution.id)
    write(`  ${capability}: ${requiredBy.join(', ') || '(unknown)'}`)
  }
}

function moduleData(graph: ApplicationModelGraphIR, module: GraphNodeIR) {
  const owned = graph.edges.filter(
    (edge) => edge.from === module.id && edge.kind === 'owns',
  )
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  return {
    id: module.id,
    name: module.name,
    description: stringAttribute(module, 'description'),
    imports: graph.edges
      .filter((edge) => edge.from === module.id && edge.kind === 'imports')
      .map((edge) => byId.get(edge.to)?.name ?? edge.to),
    providers: owned
      .map((edge) => byId.get(edge.to))
      .filter((node): node is GraphNodeIR => node?.kind === 'provider')
      .map(nodeLabel),
    executions: owned
      .map((edge) => byId.get(edge.to))
      .filter((node): node is GraphNodeIR => node?.kind === 'execution')
      .map(nodeLabel),
  }
}

interface HttpRouteProjection {
  readonly execution: string
  readonly name: string
  readonly method: string
  readonly path: string
  readonly responses?: JsonValue
}

function httpExecutions(
  graph: ApplicationModelGraphIR,
): readonly GraphNodeIR[] {
  return graph.executions.filter(
    (execution) => execution.executionKind === 'http.request',
  )
}

function httpRoutes(graph: ApplicationModelGraphIR): HttpRouteProjection[] {
  return httpExecutions(graph).flatMap((execution) => {
    const metadata: unknown = execution.extension?.metadata
    if (!isRecord(metadata)) return []
    const routes: unknown = metadata.routes
    if (!Array.isArray(routes)) return []
    return routes.flatMap((route: unknown) => {
      if (!isRecord(route)) return []
      const name = typeof route.name === 'string' ? route.name : undefined
      const method = typeof route.method === 'string' ? route.method : undefined
      const path = typeof route.path === 'string' ? route.path : undefined
      if (!name || !method || !path) return []
      return [
        {
          execution: execution.name ?? execution.id,
          name,
          method,
          path,
          ...(route.responses === undefined
            ? {}
            : { responses: route.responses }),
        },
      ]
    })
  })
}

function selectNodes(
  graph: ApplicationModelGraphIR,
  subject: Exclude<GraphSubject, 'contracts'>,
): readonly GraphNodeIR[] {
  switch (subject) {
    case 'modules':
      return graph.modules
    case 'di':
      return graph.nodes.filter(
        (node) => node.kind === 'provider' || node.kind === 'execution',
      )
    case 'executions':
      return graph.executions
    case 'runtime':
      return graph.nodes.filter(
        (node) =>
          node.kind === 'framework' &&
          node.attributes?.frameworkKind === 'runtime-capability',
      )
  }
}

function groupEdges(edges: readonly GraphEdgeIR[]): Map<string, GraphEdgeIR[]> {
  const grouped = new Map<string, GraphEdgeIR[]>()
  for (const edge of edges) {
    const current = grouped.get(edge.from) ?? []
    current.push(edge)
    grouped.set(edge.from, current)
  }
  return grouped
}

function nodeLabel(node: GraphNodeIR): string {
  return node.name ?? node.id
}

function stringAttribute(node: GraphNodeIR, name: string): string | undefined {
  const value = node.attributes?.[name]
  return typeof value === 'string' ? value : undefined
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredCapabilities(graph: ApplicationModelGraphIR): string[] {
  return [
    ...new Set(
      graph.executions.flatMap((execution) => execution.capabilities ?? []),
    ),
  ]
}

function mermaidText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

const valueOptions = new Set(['--entry', '--format', '--runtime', '--out-dir'])

function readPositionals(args: readonly string[]): string[] {
  const positionals: string[] = []
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!
    if (valueOptions.has(argument)) {
      index += 1
      continue
    }
    positionals.push(argument)
  }
  return positionals
}

function readOption(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name)
  return index < 0 ? undefined : args[index + 1]
}

function helpText(): string {
  return [
    'Loutre CLI',
    '  loutre check --entry <entry>',
    '  loutre doctor [--runtime node|deno|bun|cloudflare-workers|electron|aws-lambda] --entry <entry>',
    '  loutre graph modules|di|contracts|executions|runtime --entry <entry> [--format text|json|mermaid]',
    '  loutre explain <target> --entry <entry>',
    '  loutre build <entry> [--runtime aws-lambda|cloudflare-workers|deno] [--out-dir <directory>]',
    '',
    'Application execution is owned by the Host. Loutre CLI does not provide run/dev/start.',
  ].join('\n')
}
