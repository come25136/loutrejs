import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type {
  ApplicationModelGraphIR,
  GraphEdgeIR,
  GraphNodeIR,
  JsonValue,
} from '@loutrejs/loutre/graph'
import { hasErrorDiagnostics } from '@loutrejs/loutre'
import {
  checkRuntimeSupport,
  detectRuntimeEngine,
  nodeRuntimeSupport,
  type RuntimeSupportProfile,
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

const runtimes: Readonly<Record<string, RuntimeSupportProfile>> = {
  node: nodeRuntimeSupport,
  deno: denoRuntime,
  bun: bunRuntime,
  'cloudflare-workers': cloudflareWorkersRuntime,
  electron: electronRuntime,
  'aws-lambda': awsLambdaRuntime,
}

const runtimeNames = Object.keys(runtimes)
const deploymentRuntimes = ['aws-lambda', 'cloudflare-workers', 'deno'] as const
type DeploymentRuntime = (typeof deploymentRuntimes)[number]
type GraphSubject = 'all' | 'modules' | 'di' | 'http' | 'runtime' | 'executions'

type GraphViewNodeKind =
  | 'module'
  | 'provider'
  | 'execution'
  | 'entrypoint'
  | 'middleware'
  | 'handler'
  | 'runtime-capability'

interface GraphViewNode {
  readonly id: string
  readonly kind: GraphViewNodeKind
  readonly label: string
  readonly module?: string
  readonly executionKind?: string
  readonly capabilities?: readonly string[]
  readonly extension?: GraphNodeIR['extension']
  readonly entrypointKind?:
    | 'http-route'
    | 'message-port-method'
    | 'websocket-route'
  readonly attributes?: Readonly<Record<string, JsonValue>>
}

interface GraphViewEdge {
  readonly from: string
  readonly to: string
  readonly kind: GraphEdgeIR['kind'] | 'handles' | 'flows-to'
  readonly label?: string
}

interface GraphView {
  readonly nodes: readonly GraphViewNode[]
  readonly edges: readonly GraphViewEdge[]
}

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
      if (!hasErrorDiagnostics(graph.diagnostics)) {
        if (graph.diagnostics.length > 0) writeDiagnostics(graph, io)
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
      const check = checkRuntimeSupport(required, runtime)
      io.stdout(`Runtime: ${runtime.runtime}`)
      io.stdout(`Required: ${check.required.join(', ') || '(none)'}`)
      io.stdout(`Missing: ${check.missing.join(', ') || '(none)'}`)
      renderApplicationSummary(graph, io.stdout)
      renderCapabilityReasons(graph, check.missing, io.stdout)
      if (graph.diagnostics.length > 0) writeDiagnostics(graph, io)
      return check.ok && !hasErrorDiagnostics(graph.diagnostics) ? 0 : 1
    }

    case 'graph': {
      if (!isGraphSubject(subject)) {
        io.stderr(
          'graph requires one of: all, modules, di, executions, http, runtime.',
        )
        io.stderr(
          'Usage: loutre graph <subject> --entry <entry> [--format text|json|mermaid]',
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
      return hasErrorDiagnostics(graph.diagnostics) ? 1 : 0
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
      return hasErrorDiagnostics(graph.diagnostics) ? 1 : 0
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
      if (hasErrorDiagnostics(graph.diagnostics)) {
        writeDiagnostics(graph, io)
        return 1
      }
      if (graph.diagnostics.length > 0) writeDiagnostics(graph, io)
      if (deploymentRuntime && !hasHostNamespace(graph, 'http')) {
        io.stderr(
          `Runtime ${deploymentRuntime} entry generation requires an HTTP-capable Application.`,
        )
        return 1
      }
      if (deploymentRuntime) {
        const compatibility = checkRuntimeSupport(
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

function hasHostNamespace(
  graph: ApplicationModelGraphIR,
  namespace: string,
): boolean {
  return graph.executions.some(
    (execution) => execution.extension?.hostNamespace === namespace,
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
    value === 'all' ||
    value === 'modules' ||
    value === 'di' ||
    value === 'http' ||
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
    case 'all': {
      const view = buildGraphView(graph, subject)
      return {
        nodes: view.nodes,
        edges: view.edges,
        diagnostics: graph.diagnostics,
      }
    }
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
    case 'http':
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
  if (subject === 'all') {
    renderGraphViewText(buildGraphView(graph, subject), write)
    return
  }

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

  if (subject === 'http') {
    for (const route of httpRoutes(graph)) {
      write(`${route.execution}.${route.name} [http]`)
      write(`  ${route.method} ${route.path}`)
      write(
        `  flow: ${[...route.middlewares.map((middleware) => middleware.name), 'handler'].join(' -> ')}`,
      )
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
  const view = buildGraphView(graph, subject)
  const ids = new Map(
    view.nodes.map((candidate, index) => [candidate.id, `n${index}`]),
  )
  const moduleNames = new Map(
    graph.modules.map((module) => [module.id, module.name ?? module.id]),
  )
  const grouped = new Map<string, GraphViewNode[]>()
  const ungrouped: GraphViewNode[] = []

  for (const candidate of view.nodes) {
    const moduleId =
      candidate.kind === 'module' ? candidate.id : candidate.module
    if (!moduleId || !moduleNames.has(moduleId)) {
      ungrouped.push(candidate)
      continue
    }
    const current = grouped.get(moduleId) ?? []
    current.push(candidate)
    grouped.set(moduleId, current)
  }

  const declared = new Set<string>()
  const declareNode = (candidate: GraphViewNode, indent: string) => {
    const id = ids.get(candidate.id)!
    lines.push(`${indent}${id}["${mermaidText(mermaidNodeLabel(candidate))}"]`)
    declared.add(candidate.id)
  }

  let subgraphIndex = 0
  const subgraphs: string[] = []
  for (const [moduleId, candidates] of grouped) {
    if (candidates.length <= 1) continue
    const subgraphId = `sg${subgraphIndex++}`
    subgraphs.push(subgraphId)
    lines.push(
      `  subgraph ${subgraphId}["${mermaidText(moduleNames.get(moduleId)!)}"]`,
    )
    lines.push('    direction LR')
    for (const candidate of candidates) declareNode(candidate, '    ')
    lines.push('  end')
  }

  for (const candidate of view.nodes) {
    if (!declared.has(candidate.id)) declareNode(candidate, '  ')
  }

  const byId = new Map(view.nodes.map((candidate) => [candidate.id, candidate]))
  for (const relationship of view.edges) {
    const from = ids.get(relationship.from)
    const to = ids.get(relationship.to)
    if (!from || !to) continue
    const label = mermaidEdgeLabel(relationship, byId)
    lines.push(
      label === undefined
        ? `  ${from} --> ${to}`
        : `  ${from} -->|"${mermaidText(label)}"| ${to}`,
    )
  }

  lines.push(
    '  classDef moduleNode fill:#E0E7FF,stroke:#4F46E5,color:#1E1B4B,stroke-width:2px',
    '  classDef provider fill:#DCFCE7,stroke:#16A34A,color:#14532D',
    '  classDef controller fill:#DBEAFE,stroke:#2563EB,color:#1E3A8A,stroke-width:2px',
    '  classDef execution fill:#CFFAFE,stroke:#0891B2,color:#164E63',
    '  classDef route fill:#FEF3C7,stroke:#D97706,color:#78350F',
    '  classDef middleware fill:#F3E8FF,stroke:#9333EA,color:#581C87',
    '  classDef handler fill:#FFEDD5,stroke:#EA580C,color:#7C2D12',
    '  classDef runtimeCapability fill:#F3F4F6,stroke:#6B7280,color:#111827',
  )

  const classes = new Map<string, string[]>()
  for (const candidate of view.nodes) {
    const className = mermaidNodeClass(candidate)
    const current = classes.get(className) ?? []
    current.push(ids.get(candidate.id)!)
    classes.set(className, current)
  }
  for (const [className, nodeIds] of classes) {
    lines.push(`  class ${nodeIds.join(',')} ${className}`)
  }
  for (const subgraphId of subgraphs) {
    lines.push(
      `  style ${subgraphId} fill:#F8FAFC,stroke:#94A3B8,color:#0F172A,stroke-width:2px`,
    )
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
  write(
    `  Graph: ${hasErrorDiagnostics(graph.diagnostics) ? 'invalid' : 'valid'}`,
  )
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

interface HttpMiddlewareProjection {
  readonly name: string
  readonly capabilities: readonly string[]
}

interface HttpRouteProjection {
  readonly execution: string
  readonly name: string
  readonly method: string
  readonly path: string
  readonly middlewares: readonly HttpMiddlewareProjection[]
  readonly responses?: JsonValue
}

function httpExecutions(
  graph: ApplicationModelGraphIR,
): readonly GraphNodeIR[] {
  return graph.executions.filter(
    (execution) => execution.extension?.hostNamespace === 'http',
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
      const middlewares = Array.isArray(route.middlewares)
        ? route.middlewares.flatMap(
            (middleware): HttpMiddlewareProjection[] => {
              if (!isRecord(middleware) || typeof middleware.name !== 'string')
                return []
              return [
                {
                  name: middleware.name,
                  capabilities: Array.isArray(middleware.capabilities)
                    ? middleware.capabilities.filter(
                        (capability): capability is string =>
                          typeof capability === 'string',
                      )
                    : [],
                },
              ]
            },
          )
        : []
      return [
        {
          execution: execution.name ?? execution.id,
          name,
          method,
          path,
          middlewares,
          ...(route.responses === undefined
            ? {}
            : { responses: route.responses }),
        },
      ]
    })
  })
}

function renderGraphViewText(
  view: GraphView,
  write: (value: string) => void,
): void {
  for (const node of view.nodes) {
    write(`${node.kind}: ${node.label} [${node.id}]`)
  }
  if (view.nodes.length === 0) write('(no graph nodes)')
  write('edges:')
  if (view.edges.length === 0) write('  (none)')
  for (const edge of view.edges) {
    write(`  ${edge.from} --${edge.label ?? edge.kind}--> ${edge.to}`)
  }
}

function buildGraphView(
  graph: ApplicationModelGraphIR,
  subject: GraphSubject,
): GraphView {
  if (subject === 'http') return buildHttpGraphView(graph)

  const selected = selectApplicationNodes(graph, subject)
  const nodes = selected.map(projectGraphViewNode)
  const selectedIds = new Set(nodes.map((node) => node.id))
  const edges: GraphViewEdge[] = graph.edges
    .filter((edge) => selectedIds.has(edge.from) && selectedIds.has(edge.to))
    .map((edge) => ({ ...edge }))

  if (subject === 'all') {
    const entrypoints = projectEntrypoints(graph)
    nodes.push(...entrypoints.nodes)
    edges.push(...entrypoints.edges)
  }

  return { nodes, edges }
}

function buildHttpGraphView(graph: ApplicationModelGraphIR): GraphView {
  const executions = httpExecutions(graph).map(projectGraphViewNode)
  const entrypoints = projectHttpEntrypoints(graph)
  return {
    nodes: [...executions, ...entrypoints.nodes],
    edges: entrypoints.edges,
  }
}

function selectApplicationNodes(
  graph: ApplicationModelGraphIR,
  subject: Exclude<GraphSubject, 'http'>,
): GraphNodeIR[] {
  switch (subject) {
    case 'all':
      return graph.nodes.filter(
        (node) =>
          node.kind === 'module' ||
          node.kind === 'provider' ||
          node.kind === 'execution' ||
          isRuntimeCapabilityNode(node),
      )
    case 'modules':
      return [...graph.modules]
    case 'di':
      return graph.nodes.filter(
        (node) => node.kind === 'provider' || node.kind === 'execution',
      )
    case 'executions':
      return [...graph.executions]
    case 'runtime':
      return graph.nodes.filter(isRuntimeCapabilityNode)
  }
}

function projectGraphViewNode(node: GraphNodeIR): GraphViewNode {
  return {
    id: node.id,
    kind: isRuntimeCapabilityNode(node)
      ? 'runtime-capability'
      : (node.kind as GraphViewNodeKind),
    label: nodeLabel(node),
    ...(node.module === undefined ? {} : { module: node.module }),
    ...(node.executionKind === undefined
      ? {}
      : { executionKind: node.executionKind }),
    ...(node.capabilities === undefined
      ? {}
      : { capabilities: node.capabilities }),
    ...(node.extension === undefined ? {} : { extension: node.extension }),
    ...(node.attributes === undefined ? {} : { attributes: node.attributes }),
  }
}

function isRuntimeCapabilityNode(node: GraphNodeIR): boolean {
  return (
    node.kind === 'framework' &&
    node.attributes?.frameworkKind === 'runtime-capability'
  )
}

function projectEntrypoints(graph: ApplicationModelGraphIR): GraphView {
  const http = projectHttpEntrypoints(graph)
  const messagePort = projectMessagePortEntrypoints(graph)
  const websocket = projectWebSocketEntrypoints(graph)
  return {
    nodes: [...http.nodes, ...messagePort.nodes, ...websocket.nodes],
    edges: [...http.edges, ...messagePort.edges, ...websocket.edges],
  }
}

function projectHttpEntrypoints(graph: ApplicationModelGraphIR): GraphView {
  const nodes: GraphViewNode[] = []
  const edges: GraphViewEdge[] = []
  for (const execution of httpExecutions(graph)) {
    const metadata: unknown = execution.extension?.metadata
    if (!isRecord(metadata) || !Array.isArray(metadata.routes)) continue
    for (const route of metadata.routes) {
      if (!isRecord(route)) continue
      const name = typeof route.name === 'string' ? route.name : undefined
      const method = typeof route.method === 'string' ? route.method : undefined
      const path = typeof route.path === 'string' ? route.path : undefined
      if (!name || !method || !path) continue
      const routeId = entrypointId('http', execution.id, name)
      nodes.push({
        id: routeId,
        kind: 'entrypoint',
        entrypointKind: 'http-route',
        label: `${method} ${path}`,
        ...(execution.module === undefined ? {} : { module: execution.module }),
        attributes: { name, method, path },
      })
      edges.push({
        from: execution.id,
        to: routeId,
        kind: 'handles',
        label: name,
      })

      let previousId = routeId
      const middlewares = Array.isArray(route.middlewares)
        ? route.middlewares
        : []
      for (const [index, middleware] of middlewares.entries()) {
        if (!isRecord(middleware) || typeof middleware.name !== 'string')
          continue
        const middlewareId = httpMiddlewareStepId(execution.id, name, index)
        const capabilities = Array.isArray(middleware.capabilities)
          ? middleware.capabilities.filter(
              (capability): capability is string =>
                typeof capability === 'string',
            )
          : []
        nodes.push({
          id: middlewareId,
          kind: 'middleware',
          label: middleware.name,
          ...(execution.module === undefined
            ? {}
            : { module: execution.module }),
          ...(capabilities.length === 0 ? {} : { capabilities }),
          attributes: { route: name, index },
        })
        edges.push({ from: previousId, to: middlewareId, kind: 'flows-to' })
        for (const capability of capabilities) {
          edges.push({
            from: middlewareId,
            to: `capability:${capability}`,
            kind: 'requires',
          })
        }
        previousId = middlewareId
      }

      const handlerId = httpHandlerId(execution.id, name)
      nodes.push({
        id: handlerId,
        kind: 'handler',
        label: `${execution.name ?? execution.id}.${name}`,
        ...(execution.module === undefined ? {} : { module: execution.module }),
        attributes: { route: name },
      })
      edges.push({ from: previousId, to: handlerId, kind: 'flows-to' })
    }
  }
  return { nodes, edges }
}

function projectMessagePortEntrypoints(
  graph: ApplicationModelGraphIR,
): GraphView {
  const nodes: GraphViewNode[] = []
  const edges: GraphViewEdge[] = []
  for (const execution of graph.executions) {
    if (execution.extension?.hostNamespace !== 'messagePort') continue
    const metadata: unknown = execution.extension.metadata
    if (!isRecord(metadata) || !Array.isArray(metadata.methods)) continue
    for (const method of metadata.methods) {
      if (typeof method !== 'string') continue
      const id = entrypointId('message-port', execution.id, method)
      nodes.push({
        id,
        kind: 'entrypoint',
        entrypointKind: 'message-port-method',
        label: `MessagePort ${method}`,
        ...(execution.module === undefined ? {} : { module: execution.module }),
        attributes: { method },
      })
      edges.push({
        from: execution.id,
        to: id,
        kind: 'handles',
        label: method,
      })
    }
  }
  return { nodes, edges }
}

function projectWebSocketEntrypoints(
  graph: ApplicationModelGraphIR,
): GraphView {
  const nodes: GraphViewNode[] = []
  const edges: GraphViewEdge[] = []
  for (const execution of graph.executions) {
    if (execution.extension?.hostNamespace !== 'websocket') continue
    const metadata: unknown = execution.extension.metadata
    if (!isRecord(metadata) || !Array.isArray(metadata.routes)) continue
    for (const route of metadata.routes) {
      if (!isRecord(route)) continue
      const name = typeof route.name === 'string' ? route.name : undefined
      const path = typeof route.path === 'string' ? route.path : undefined
      if (!name || !path) continue
      const id = entrypointId('websocket', execution.id, name)
      nodes.push({
        id,
        kind: 'entrypoint',
        entrypointKind: 'websocket-route',
        label: `WebSocket ${path}`,
        ...(execution.module === undefined ? {} : { module: execution.module }),
        attributes: { name, path },
      })
      edges.push({
        from: execution.id,
        to: id,
        kind: 'handles',
        label: name,
      })
    }
  }
  return { nodes, edges }
}

function entrypointId(
  namespace: string,
  executionId: string,
  localId: string,
): string {
  return `entrypoint:${namespace}:${encodeURIComponent(executionId)}:${encodeURIComponent(localId)}`
}

function httpMiddlewareStepId(
  executionId: string,
  routeName: string,
  index: number,
): string {
  return `middleware:http:${encodeURIComponent(executionId)}:${encodeURIComponent(routeName)}:${index}`
}

function httpHandlerId(executionId: string, routeName: string): string {
  return `handler:http:${encodeURIComponent(executionId)}:${encodeURIComponent(routeName)}`
}

function mermaidNodeLabel(node: GraphViewNode): string {
  const role = (() => {
    switch (node.kind) {
      case 'module':
        return 'Module'
      case 'provider':
        return 'Provider'
      case 'execution':
        return node.extension?.hostNamespace === 'http'
          ? 'HTTP Controller'
          : 'Execution'
      case 'entrypoint':
        return 'Route'
      case 'middleware':
        return 'Middleware'
      case 'handler':
        return 'Handler'
      case 'runtime-capability':
        return 'Runtime Capability'
    }
  })()
  return `${role}: ${node.label}`
}

function mermaidNodeClass(node: GraphViewNode): string {
  switch (node.kind) {
    case 'module':
      return 'moduleNode'
    case 'provider':
      return 'provider'
    case 'execution':
      return node.extension?.hostNamespace === 'http'
        ? 'controller'
        : 'execution'
    case 'entrypoint':
      return 'route'
    case 'middleware':
      return 'middleware'
    case 'handler':
      return 'handler'
    case 'runtime-capability':
      return 'runtimeCapability'
  }
}

function mermaidEdgeLabel(
  edge: GraphViewEdge,
  byId: ReadonlyMap<string, GraphViewNode>,
): string | undefined {
  if (edge.kind === 'flows-to') return undefined
  if (edge.kind !== 'owns') return edge.label ?? edge.kind
  const target = byId.get(edge.to)
  if (!target) return edge.kind
  switch (target.kind) {
    case 'provider':
      return 'provider'
    case 'execution':
      return target.extension?.hostNamespace === 'http'
        ? 'controller'
        : 'execution'
    default:
      return edge.kind
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
    '  loutre graph all|modules|di|executions|http|runtime --entry <entry> [--format text|json|mermaid]',
    '  loutre explain <target> --entry <entry>',
    '  loutre build <entry> [--runtime aws-lambda|cloudflare-workers|deno] [--out-dir <directory>]',
    '',
    'Application execution is owned by the Host. Loutre CLI does not provide run/dev/start.',
  ].join('\n')
}
