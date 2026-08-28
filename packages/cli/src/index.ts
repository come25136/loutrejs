import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
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
import { nodeRuntime } from '@loutrejs/runtime-node'
import { workerdRuntime } from '@loutrejs/runtime-workerd'
import { emitApplication, loadApplicationGraph } from './application-loader.js'

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
        `${command}には--entry <明示entry>が必要です。filesystem discoveryは行いません。`,
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
        io.stderr(
          'graphにはmodules、di、contracts、executions、runtimeのいずれかが必要です。',
        )
        return 2
      }
      const target = entry()
      if (!target) return 2
      const graph = await loadApplicationGraph(target)
      const format = readOption(args, '--format') ?? 'text'
      if (!['text', 'json', 'mermaid'].includes(format)) {
        io.stderr(
          'graph --formatにはtext、json、mermaidのいずれかを指定してください。',
        )
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
      const outputDirectory = resolve(
        io.cwd,
        readOption(args, '--out-dir') ?? 'dist/loutre',
      )
      await mkdir(outputDirectory, { recursive: true })
      const applicationOutput = join(outputDirectory, 'application.mjs')
      await emitApplication(applicationEntry, applicationOutput)
      const fingerprint = createHash('sha256')
        .update(JSON.stringify(graph))
        .digest('hex')
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

    default:
      io.stderr(`不明なcommandです: ${command}`)
      return 2
  }
}

function isGraphSubject(
  value: string | undefined,
): value is 'modules' | 'di' | 'contracts' | 'runtime' | 'executions' {
  return (
    value === 'modules' ||
    value === 'di' ||
    value === 'contracts' ||
    value === 'runtime' ||
    value === 'executions'
  )
}

function writeDiagnostics(graph: ApplicationGraphIR, io: CliIO): void {
  for (const diagnostic of graph.diagnostics) {
    io.stderr(`${diagnostic.code} ${diagnostic.path}\n${diagnostic.message}`)
  }
}

function graphData(
  graph: ApplicationGraphIR,
  subject: 'modules' | 'di' | 'contracts' | 'runtime' | 'executions',
): unknown {
  switch (subject) {
    case 'modules':
      return {
        version: graph.version,
        modules: graph.modules,
        arguments: graph.arguments,
        diagnostics: graph.diagnostics,
      }
    case 'di':
      return {
        version: graph.version,
        nodes: graph.nodes,
        edges: graph.edges,
        diagnostics: graph.diagnostics,
      }
    case 'contracts':
      return {
        version: graph.version,
        contracts: graph.contracts,
        pipelines: graph.pipelines,
        implementations: graph.implementations,
        diagnostics: graph.diagnostics,
      }
    case 'runtime':
      return {
        version: graph.version,
        capabilities: graph.capabilities,
        hostCapabilities: graph.hostCapabilities,
        diagnostics: graph.diagnostics,
      }
    case 'executions':
      return {
        version: graph.version,
        tasks: graph.tasks,
        executions: graph.executions,
        queues: graph.queues,
        diagnostics: graph.diagnostics,
      }
  }
}

function renderTextGraph(
  graph: ApplicationGraphIR,
  subject: 'modules' | 'di' | 'contracts' | 'runtime' | 'executions',
  write: (value: string) => void,
): void {
  if (subject === 'modules') {
    for (const module of graph.modules) {
      write(
        module.name === undefined ? module.id : `${module.name} [${module.id}]`,
      )
      if (module.description !== undefined)
        write(`  description: ${module.description}`)
      write(`  imports: ${module.imports.join(', ') || '(なし)'}`)
      write(`  environment: ${module.environment.join(', ') || '(なし)'}`)
      write(`  providers: ${module.providers.join(', ') || '(なし)'}`)
      write(`  exports: ${module.exports.join(', ') || '(なし)'}`)
      write(`  lifecycle: ${module.lifecycle.join(', ') || '(なし)'}`)
      write(`  requires: ${module.requires.join(', ') || '(なし)'}`)
    }
    if (graph.arguments) write(`Application Arguments: ${graph.arguments.name}`)
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
    for (const capability of graph.hostCapabilities) write(`host:${capability}`)
    return
  }

  if (subject === 'executions') {
    for (const task of graph.tasks) {
      write(`task: ${task.name}${task.public ? ' [public]' : ' [internal]'}`)
    }
    for (const execution of graph.executions)
      write(`${execution.kind}: ${execution.id}`)
    for (const queue of graph.queues) write(`queue: ${queue.name}`)
    return
  }

  renderDiText(graph, write)
}

function renderDiText(
  graph: ApplicationGraphIR,
  write: (value: string) => void,
): void {
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
        ? ` [${edge.condition.source}:${edge.condition.contract}.${edge.condition.key}=${String(edge.condition.equals)}]`
        : ''
      const unresolved = graph.diagnostics.some(
        (diagnostic) =>
          diagnostic.code === 'LUTRE_DI_UNRESOLVED' &&
          diagnostic.message.includes(child.label),
      )
      write(
        `${prefix}${last ? '└──' : '├──'}${condition} ${nodeLabel(child)}${cycle ? ' ↺ cycle' : unresolved ? ' ✗ UNRESOLVED' : ''}`,
      )
      if (!cycle) {
        render(edge.to, `${prefix}${last ? '    ' : '│   '}`, [
          ...lineage,
          edge.to,
        ])
      }
    })
  }

  const roots = graph.nodes.filter(
    (node) =>
      !incoming.has(node.id) && (outgoing.get(node.id)?.length ?? 0) > 0,
  )
  for (const root of roots) {
    renderedRoots.add(root.id)
    write(nodeLabel(root))
    render(root.id, '', [root.id])
  }
  for (const node of graph.nodes) {
    if (
      renderedRoots.has(node.id) ||
      (outgoing.get(node.id)?.length ?? 0) === 0
    )
      continue
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
  subject: 'modules' | 'di' | 'contracts' | 'runtime' | 'executions',
): string {
  const lines = ['flowchart LR']
  const node = (id: string, label: string) =>
    lines.push(`  ${id}["${mermaidText(label)}"]`)
  const edge = (from: string, to: string, label?: string) =>
    lines.push(`  ${from} -->${label ? `|"${mermaidText(label)}"|` : ''} ${to}`)

  if (subject === 'di') {
    const ids = new Map(
      graph.nodes.map((candidate, index) => [candidate.id, `n${index}`]),
    )
    for (const candidate of graph.nodes)
      node(ids.get(candidate.id)!, nodeLabel(candidate))
    for (const dependency of graph.edges) {
      const condition = dependency.condition
        ? `${dependency.kind}: ${dependency.condition.source}:${dependency.condition.contract}.${dependency.condition.key}=${String(dependency.condition.equals)}`
        : `${dependency.kind}/${dependency.source}`
      edge(
        ids.get(dependency.from) ?? mermaidId(dependency.from),
        ids.get(dependency.to) ?? mermaidId(dependency.to),
        condition,
      )
    }
  } else if (subject === 'modules') {
    const ids = new Map(
      graph.modules.map((module, index) => [module.id, `m${index}`]),
    )
    for (const module of graph.modules) {
      node(ids.get(module.id)!, module.name ?? module.description ?? module.id)
      for (const imported of module.imports) {
        edge(ids.get(module.id)!, ids.get(imported) ?? mermaidId(imported))
      }
    }
    if (graph.arguments)
      node('application_arguments', `Arguments: ${graph.arguments.name}`)
  } else if (subject === 'contracts') {
    graph.pipelines.forEach((pipeline, pipelineIndex) => {
      const procedureId = `p${pipelineIndex}`
      node(
        procedureId,
        `${pipeline.contract}.${pipeline.procedure} [${pipeline.protocol}]`,
      )
      renderLayerMermaid(
        pipeline.layers,
        `p${pipelineIndex}`,
        procedureId,
        node,
        edge,
      )
    })
  } else if (subject === 'executions') {
    for (const queue of graph.queues) node(mermaidId(queue.id), queue.name)
    for (const task of graph.tasks) node(mermaidId(task.id), task.name)
    for (const execution of graph.executions) {
      const id = mermaidId(execution.id)
      node(
        id,
        `${execution.kind}: ${'name' in execution ? execution.name : execution.procedure}`,
      )
      if (execution.kind === 'trigger') {
        if (execution.trigger === 'queue-consumer') {
          edge(mermaidId(`queue:${execution.queue}`), id, 'consume')
        }
        edge(id, mermaidId(`task:${execution.task}`), 'trigger')
      }
    }
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
  const node = graph.nodes.find(
    (candidate) => candidate.label === subject || candidate.id === subject,
  )
  const pipelines = graph.pipelines.filter(
    (pipeline) =>
      `${pipeline.contract}.${pipeline.procedure}` === subject ||
      pipeline.contract === subject,
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
      const dependency = graph.nodes.find(
        (candidate) => candidate.id === edge.to,
      )
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
    if (current.pipeline)
      renderLayerText(current.pipeline, write, `${indent}  `)
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

function readOption(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name)
  return index < 0 ? undefined : args[index + 1]
}

function helpText(): string {
  return [
    'Loutre CLI',
    '  loutre check --entry <明示entry>',
    '  loutre doctor [node|deno|bun|workerd|electron|lambda] --entry <明示entry>',
    '  loutre graph modules|di|contracts|executions|runtime --entry <明示entry> [--format text|json|mermaid]',
    '  loutre explain <target> --entry <明示entry>',
    '  loutre build <明示entry> [--out-dir <directory>]',
    '',
    'Applicationの実行方法はHostが所有します。run/dev/startはLoutre CLIにはありません。',
  ].join('\n')
}
