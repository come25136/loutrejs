import {
  asModuleInstance,
  childPipelineOf,
  contextKeyName,
  isEnvClass,
  layerDefinitionOf,
  normalizeProvider,
  tokenName,
  type ContractDefinition,
  type ContextKey,
  type DependencyConsumer,
  type EntrypointConsumer,
  type EntrypointDescriptor,
  type ImplementationConsumer,
  type ImplementationDescriptor,
  type ModuleInstance,
  type ModuleTemplate,
  type PipelineItem,
  type ProviderDescriptor,
  type LayerConsumer,
  type ShortCircuitDeclaration,
  type TokenLike,
  type QueueDescriptor,
} from '@loutrejs/core'
import { Container, Logger, type DependencyRecorder } from '@loutrejs/runtime'
import type {
  ApplicationGraphIR,
  CompilationResult,
  DependencyEdgeIR,
  DependencyNodeIR,
  Diagnostic,
  ImplementationIR,
  LayerIR,
  PipelineIR,
  QueueIR,
  ExecutionRootIR,
} from './ir.js'

interface ImplementationTarget {
  readonly implementation: ImplementationDescriptor
  readonly contractName: string
  readonly procedure: string
  readonly protocol: string
  readonly dispatchKey: string | null
  readonly pipeline: readonly PipelineItem[]
  readonly interaction: string
  readonly responses?: Readonly<Record<string, { readonly status: number }>>
}

export class StaticValidationError extends Error {
  constructor(
    readonly diagnostics: readonly Diagnostic[],
    readonly graph?: ApplicationGraphIR,
  ) {
    super(
      diagnostics
        .map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`)
        .join('\n'),
    )
    this.name = 'StaticValidationError'
  }
}

interface LegacyScheduleDescriptor {
  readonly kind: 'schedule'
  readonly name: string
  readonly cron: {
    readonly expression: string
    readonly timezone: string
  }
  readonly entrypoint: EntrypointDescriptor<void, void>
}

interface LegacyQueueConsumerDescriptor {
  readonly kind: 'queue-consumer'
  readonly name: string
  readonly queue: QueueDescriptor<any>
  readonly entrypoint: EntrypointDescriptor<any, void>
}

export interface ApplicationCompilationInput {
  readonly modules: readonly (ModuleInstance | ModuleTemplate<void>)[]
  readonly entrypoints?: readonly EntrypointDescriptor<any, any>[]
  readonly schedules?: readonly LegacyScheduleDescriptor[]
  readonly queues?: readonly QueueDescriptor<any>[]
  readonly consumers?: readonly LegacyQueueConsumerDescriptor[]
}

export function compileApplication(
  input: ApplicationCompilationInput,
): CompilationResult {
  const modules = collectModules(input.modules)
  const providers = modules.flatMap((module) =>
    (module.definition.providers ?? []).map(normalizeProvider),
  )
  const diagnostics: Diagnostic[] = []
  const entrypoints = collectEntrypoints(input, diagnostics)
  const queues = collectQueues(input, diagnostics)
  validateNamedDescriptors(
    input.schedules ?? [],
    'LUTRE_SCHEDULE_DUPLICATE',
    diagnostics,
  )
  validateNamedDescriptors(
    input.consumers ?? [],
    'LUTRE_CONSUMER_DUPLICATE',
    diagnostics,
  )
  validateSchedules(input.schedules ?? [], diagnostics)
  const contractNames = new Map<ContractDefinition, string>()
  let contractSequence = 0
  const nameContract = (contract: ContractDefinition) => {
    const current = contractNames.get(contract)
    if (current) return current
    const name = contract.name ?? `Contract${++contractSequence}`
    contractNames.set(contract, name)
    return name
  }

  const descriptors = modules.flatMap(
    (module) => module.definition.implementations ?? [],
  )
  const targets: ImplementationTarget[] = []

  for (const implementation of descriptors) {
    for (const procedureName of implementation.procedures) {
      const procedure = implementation.contract.procedures[procedureName]
      const protocol = procedure?.protocols[implementation.protocol] as
        | {
            readonly pipeline?: readonly PipelineItem[]
            readonly interaction?: string
            readonly dispatchKey: string | null
            readonly definition?: {
              readonly pipeline?: readonly PipelineItem[]
              readonly interaction?: string
              readonly responses?: Readonly<
                Record<string, { readonly status: number }>
              >
            }
          }
        | undefined
      if (!procedure || !protocol) {
        diagnostics.push({
          code: 'LUTRE_IMPL_003',
          message: `${procedureName} is not declared for protocol ${implementation.protocol}`,
          path: `${nameContract(implementation.contract)}.${procedureName}.${implementation.protocol}`,
        })
        continue
      }
      targets.push({
        implementation,
        contractName: nameContract(implementation.contract),
        procedure: procedureName,
        protocol: implementation.protocol,
        dispatchKey: protocol.dispatchKey,
        pipeline: protocol.pipeline ?? protocol.definition?.pipeline ?? [],
        interaction:
          protocol.interaction ?? protocol.definition?.interaction ?? 'unary',
        ...(protocol.definition?.responses === undefined
          ? {}
          : { responses: protocol.definition.responses }),
      })
    }
  }

  validateDispatchKeys(targets, diagnostics)
  validateCoverage(descriptors, contractNames, diagnostics)
  validateDuplicateProviders(modules, diagnostics)

  const tokensById = collectCustomTokens(providers, targets, diagnostics)
  const contextKeysByName = collectContextKeys(targets, diagnostics)

  const pipelines: PipelineIR[] = []
  const implementations: ImplementationIR[] = []
  for (const target of targets) {
    validatePipeline(target, diagnostics)

    pipelines.push({
      contract: target.contractName,
      procedure: target.procedure,
      protocol: target.protocol,
      layers: target.pipeline.map(toLayerIR),
    })
    implementations.push({
      contract: target.contractName,
      procedure: target.procedure,
      protocol: target.protocol,
      implementation: target.implementation.name,
      method: target.procedure,
    })
  }

  const dependencyGraph = buildDependencyGraph(
    modules,
    descriptors,
    targets,
    entrypoints,
    diagnostics,
  )
  const probedTokenIds = dependencyGraph.nodes
    .filter((node) => node.kind === 'token')
    .map((node) => node.label)
  const graph: ApplicationGraphIR = {
    version: 3,
    modules: modules.map((module, index) => ({
      id: `module:${index + 1}`,
      ...(module.definition.name === undefined
        ? {}
        : { name: module.definition.name }),
      ...(module.definition.description === undefined
        ? {}
        : { description: module.definition.description }),
      imports: (module.definition.imports ?? []).map((imported) => {
        const importedIndex = modules.indexOf(imported)
        return `module:${importedIndex + 1}`
      }),
      environment: (module.definition.environment ?? []).map(
        (environment) => environment.name,
      ),
      providers: (module.definition.providers ?? [])
        .map(normalizeProvider)
        .filter((provider) => provider.kind !== 'environment')
        .map((provider) => tokenName(provider.provide)),
      exports: (module.definition.exports ?? []).map((value) =>
        typeof value === 'function'
          ? value.name
          : typeof value === 'object' &&
              value !== null &&
              'kind' in value &&
              value.kind === 'token' &&
              'id' in value
            ? String(value.id)
            : String(value),
      ),
      lifecycle: Object.keys(module.definition.lifecycle ?? {}),
      requires: module.definition.requires ?? [],
    })),
    providers: dedupeProviders(providers).map((provider) => ({
      token: tokenName(provider.provide),
      kind: provider.kind,
      scope: provider.scope,
      dependencies:
        provider.kind === 'factory'
          ? provider.inject.map(tokenName)
          : provider.kind === 'conditional'
            ? [provider.select.env.name]
            : [],
    })),
    tokens: [...new Set([...tokensById.keys(), ...probedTokenIds])].map(
      (id) => ({ id }),
    ),
    contextKeys: [...contextKeysByName.keys()].map((name) => ({ name })),
    contracts: [...contractNames.values()],
    pipelines,
    implementations,
    queues: queues.map<QueueIR>((queue) => ({
      id: `queue:${queue.name}`,
      name: queue.name,
    })),
    executions: [
      ...targets.map<ExecutionRootIR>((target) => ({
        id: `protocol:${target.protocol}:${target.contractName}.${target.procedure}`,
        kind: 'protocol',
        protocol: target.protocol,
        contract: target.contractName,
        procedure: target.procedure,
        implementation: target.implementation.name,
      })),
      ...entrypoints.map<ExecutionRootIR>((entrypoint) => ({
        id: `entrypoint:${entrypoint.name}`,
        kind: 'entrypoint',
        name: entrypoint.name,
      })),
      ...(input.schedules ?? []).map<ExecutionRootIR>((schedule) => ({
        id: `schedule:${schedule.name}`,
        kind: 'schedule',
        name: schedule.name,
        cron: schedule.cron,
        entrypoint: schedule.entrypoint.name,
      })),
      ...(input.consumers ?? []).map<ExecutionRootIR>((consumer) => ({
        id: `queue-consumer:${consumer.name}`,
        kind: 'queue-consumer',
        name: consumer.name,
        queue: consumer.queue.name,
        entrypoint: consumer.entrypoint.name,
      })),
    ],
    capabilities: [
      ...targets.flatMap((target) => {
        const requiredBy = `${target.contractName}.${target.procedure}`
        return [
          { name: 'crypto.random', scope: 'execution' as const, requiredBy },
          ...(target.protocol === 'http'
            ? [{ name: 'http.server', scope: 'execution' as const, requiredBy }]
            : []),
          ...(target.protocol === 'messagePort'
            ? [
                {
                  name: 'messagePort.send',
                  scope: 'execution' as const,
                  requiredBy,
                },
                {
                  name: 'messagePort.receive',
                  scope: 'execution' as const,
                  requiredBy,
                },
              ]
            : []),
          ...(target.interaction === 'server-stream'
            ? [
                {
                  name: 'stream.readable',
                  scope: 'execution' as const,
                  requiredBy,
                },
                ...(target.protocol === 'http'
                  ? [
                      {
                        name: 'http.response.streaming',
                        scope: 'execution' as const,
                        requiredBy,
                      },
                    ]
                  : []),
              ]
            : []),
        ]
      }),
      ...modules.flatMap((module, index) => [
        ...(module.definition.environment?.length
          ? [
              {
                name: 'env.runtime',
                scope: 'application' as const,
                requiredBy: `module:${index + 1}`,
              },
            ]
          : []),
        ...(module.definition.requires ?? []).map((name) => ({
          name,
          scope: 'application' as const,
          requiredBy: `module:${index + 1}`,
        })),
      ]),
    ],
    ...dependencyGraph,
    diagnostics,
  }

  return { graph, diagnostics }
}

function validateDispatchKeys(
  targets: readonly ImplementationTarget[],
  diagnostics: Diagnostic[],
): void {
  const targetsByKey = new Map<string, ImplementationTarget>()
  for (const target of targets) {
    if (target.dispatchKey === null) continue
    const path = `${target.contractName}.${target.procedure}.${target.protocol}`
    const existing = targetsByKey.get(target.dispatchKey)
    if (existing) {
      if (
        existing.implementation.contract === target.implementation.contract &&
        existing.procedure === target.procedure &&
        existing.protocol === target.protocol
      ) {
        continue
      }
      const existingPath = `${existing.contractName}.${existing.procedure}.${existing.protocol}`
      diagnostics.push({
        code: 'LUTRE_PROTOCOL_001',
        message: `Duplicate protocol dispatch key "${target.dispatchKey}": ${existingPath}, ${path}`,
        path,
      })
      continue
    }
    targetsByKey.set(target.dispatchKey, target)
  }
}

export const buildApplicationGraph = compileApplication

function collectEntrypoints(
  input: ApplicationCompilationInput,
  diagnostics: Diagnostic[],
): readonly EntrypointDescriptor<any, any>[] {
  const collected = [
    ...(input.entrypoints ?? []),
    ...(input.schedules ?? []).map((schedule) => schedule.entrypoint),
    ...(input.consumers ?? []).map((consumer) => consumer.entrypoint),
  ]
  const unique = [...new Set(collected)]
  validateNamedDescriptors(unique, 'LUTRE_ENTRYPOINT_DUPLICATE', diagnostics)
  return unique
}

function collectQueues(
  input: ApplicationCompilationInput,
  diagnostics: Diagnostic[],
): readonly QueueDescriptor<any>[] {
  const collected = [
    ...(input.queues ?? []),
    ...(input.consumers ?? []).map((consumer) => consumer.queue),
  ]
  const unique = [...new Set(collected)]
  validateNamedDescriptors(unique, 'LUTRE_QUEUE_DUPLICATE', diagnostics)
  return unique
}

function validateNamedDescriptors(
  descriptors: readonly { readonly name: string }[],
  code: string,
  diagnostics: Diagnostic[],
): void {
  const names = new Map<string, { readonly name: string }>()
  for (const descriptor of descriptors) {
    const existing = names.get(descriptor.name)
    if (existing && existing !== descriptor) {
      diagnostics.push({
        code,
        message: `Name ${descriptor.name} is declared by multiple descriptors.`,
        path: descriptor.name,
      })
      continue
    }
    names.set(descriptor.name, descriptor)
  }
}

function validateSchedules(
  schedules: readonly LegacyScheduleDescriptor[],
  diagnostics: Diagnostic[],
): void {
  for (const schedule of schedules) {
    if (!isValidCronExpression(schedule.cron.expression)) {
      diagnostics.push({
        code: 'LUTRE_SCHEDULE_INVALID_CRON',
        message: `Schedule ${schedule.name} must use a portable 5-field cron expression.`,
        path: schedule.name,
      })
    }
    try {
      new Intl.DateTimeFormat('en-US', {
        timeZone: schedule.cron.timezone,
      }).format()
    } catch {
      diagnostics.push({
        code: 'LUTRE_SCHEDULE_INVALID_TIMEZONE',
        message: `Schedule ${schedule.name} must use a valid IANA timezone.`,
        path: schedule.name,
      })
    }
  }
}

function isValidCronExpression(expression: string): boolean {
  const fields = expression.trim().split(/\s+/)
  if (fields.length !== 5) return false
  const ranges = [
    [0, 59],
    [0, 23],
    [1, 31],
    [1, 12],
    [0, 7],
  ] as const
  return fields.every((field, index) => {
    const range = ranges[index]
    return range !== undefined && isValidCronField(field, range[0], range[1])
  })
}

function isValidCronField(
  field: string,
  minimum: number,
  maximum: number,
): boolean {
  return field.split(',').every((segment) => {
    const parts = segment.split('/')
    if (parts.length > 2) return false
    const rangeExpression = parts[0]
    const stepExpression = parts[1]
    if (!rangeExpression) return false
    if (
      stepExpression !== undefined &&
      (!/^\d+$/.test(stepExpression) || Number(stepExpression) <= 0)
    ) {
      return false
    }
    if (rangeExpression === '*') return true
    const bounds = rangeExpression.split('-')
    if (bounds.length > 2 || bounds.some((bound) => !/^\d+$/.test(bound))) {
      return false
    }
    const start = Number(bounds[0])
    const end = bounds[1] === undefined ? start : Number(bounds[1])
    return start >= minimum && end <= maximum && start <= end
  })
}

export function validateGraph(
  graph: ApplicationGraphIR,
): readonly Diagnostic[] {
  return graph.diagnostics
}

function buildDependencyGraph(
  modules: readonly ModuleInstance[],
  descriptors: readonly ImplementationDescriptor[],
  targets: readonly ImplementationTarget[],
  entrypoints: readonly EntrypointDescriptor<any, any>[],
  diagnostics: Diagnostic[],
): Pick<ApplicationGraphIR, 'nodes' | 'edges'> {
  const nodes: DependencyNodeIR[] = []
  const edges: DependencyEdgeIR[] = []
  const ids = new Map<TokenLike, string>()
  const implementationIds = new Map<ImplementationDescriptor, string>()
  const entrypointIds = new Map<EntrypointDescriptor<any, any>, string>()
  const modulesByProvider = new Map<TokenLike, string>()
  const providersByToken = new Map<TokenLike, ProviderDescriptor>()
  const customTokensById = new Map<string, TokenLike>()

  modules.forEach((module, index) => {
    const moduleId = `module:${index + 1}`
    for (const declaration of module.definition.providers ?? []) {
      const provider = normalizeProvider(declaration)
      if (!modulesByProvider.has(provider.provide)) {
        modulesByProvider.set(provider.provide, moduleId)
      }
      if (!providersByToken.has(provider.provide)) {
        providersByToken.set(provider.provide, provider)
      }
    }
  })

  const ensureNode = (
    token: TokenLike,
    overrides: Partial<Omit<DependencyNodeIR, 'id' | 'label'>> = {},
  ): string => {
    if (typeof token !== 'function') {
      const registered = customTokensById.get(token.id)
      if (
        registered &&
        registered !== token &&
        !diagnostics.some(
          (diagnostic) =>
            diagnostic.code === 'LUTRE_TOKEN_001' &&
            diagnostic.message.includes(token.id),
        )
      ) {
        diagnostics.push({
          code: 'LUTRE_TOKEN_001',
          message: `Token ID ${token.id}が異なるtoken declarationで重複しています`,
          path: `dependency:${token.id}`,
        })
      } else if (!registered) {
        customTokensById.set(token.id, token)
      }
    }
    const current = ids.get(token)
    if (current) return current
    const base =
      typeof token === 'function' ? `class:${token.name}` : `token:${token.id}`
    let id = base
    let sequence = 2
    while (nodes.some((node) => node.id === id)) id = `${base}:${sequence++}`
    ids.set(token, id)
    const provider = providersByToken.get(token)
    const scope = overrides.scope ?? provider?.scope
    const module = overrides.module ?? modulesByProvider.get(token)
    nodes.push({
      id,
      label: tokenName(token),
      kind:
        overrides.kind ??
        (provider?.kind === 'environment'
          ? 'environment'
          : typeof token === 'function'
            ? 'class'
            : 'token'),
      ...(scope === undefined ? {} : { scope }),
      ...(module === undefined ? {} : { module }),
    })
    return id
  }

  const ensureImplementationNode = (
    implementation: ImplementationDescriptor,
  ): string => {
    const current = implementationIds.get(implementation)
    if (current) return current
    const id = `implementation:${implementationIds.size + 1}`
    implementationIds.set(implementation, id)
    nodes.push({
      id,
      label: implementation.name,
      kind: 'implementation',
      scope: 'application',
    })
    return id
  }

  const ensureEntrypointNode = (
    entrypoint: EntrypointDescriptor<any, any>,
  ): string => {
    const current = entrypointIds.get(entrypoint)
    if (current) return current
    const id = `entrypoint:${entrypoint.name}`
    entrypointIds.set(entrypoint, id)
    nodes.push({
      id,
      label: entrypoint.name,
      kind: 'entrypoint',
      scope: 'application',
    })
    return id
  }

  const addEdge = (edge: DependencyEdgeIR) => {
    if (
      !edges.some(
        (candidate) =>
          candidate.from === edge.from &&
          candidate.to === edge.to &&
          candidate.kind === edge.kind &&
          candidate.source === edge.source &&
          candidate.condition?.key === edge.condition?.key &&
          candidate.condition?.equals === edge.condition?.equals,
      )
    ) {
      edges.push(edge)
    }
  }

  const validateDeclaredDependency = (dependency: TokenLike, path: string) => {
    if (
      providersByToken.has(dependency) ||
      dependency === (Logger as unknown as TokenLike)
    )
      return
    if (isEnvClass(dependency)) {
      diagnostics.push({
        code: 'LUTRE_ENV_002',
        message: `${dependency.name} is injected but is not declared by any Module.environment.`,
        path,
      })
      return
    }
    diagnostics.push({
      code: 'LUTRE_DI_UNRESOLVED',
      message: `${path} requires ${tokenName(dependency)}, but no provider is declared for ${tokenName(dependency)}.`,
      path,
    })
  }

  for (const provider of providersByToken.values()) {
    const providerId = ensureNode(provider.provide)
    if (provider.kind === 'class' && provider.provide !== provider.useClass) {
      addEdge({
        from: providerId,
        to: ensureNode(provider.useClass, { scope: provider.scope }),
        kind: 'framework',
        source: 'declared',
      })
    }
    if (provider.kind === 'factory') {
      for (const dependency of provider.inject) {
        validateDeclaredDependency(dependency, tokenName(provider.provide))
        addEdge({
          from: providerId,
          to: ensureNode(dependency),
          kind: 'factory',
          source: 'declared',
        })
      }
      if (provider.useFactory.constructor.name === 'AsyncFunction') {
        diagnostics.push({
          code: 'LUTRE_DI_ASYNC_FACTORY',
          message:
            'Async factory providers are not supported. Move asynchronous resource initialization to application lifecycle.',
          path: tokenName(provider.provide),
        })
      }
    }
    if (provider.kind === 'conditional') {
      validateDeclaredDependency(
        provider.select.env,
        tokenName(provider.provide),
      )
      addEdge({
        from: providerId,
        to: ensureNode(provider.select.env),
        kind: 'conditional',
        source: 'declared',
      })
      for (const equals of Reflect.ownKeys(provider.mapping)) {
        const candidate = provider.mapping[equals]
        if (!candidate) continue
        addEdge({
          from: providerId,
          to: ensureNode(candidate, { scope: provider.scope }),
          kind: 'conditional',
          source: 'declared',
          condition: { key: provider.select.key, equals },
        })
      }
    }
  }

  for (const implementation of descriptors) {
    ensureImplementationNode(implementation)
  }

  modules.forEach((module, index) => {
    const lifecycle = module.definition.lifecycle
    if (!lifecycle) return
    for (const [hookName, hook] of Object.entries(lifecycle)) {
      if (!hook) continue
      const hookId = `lifecycle:module:${index + 1}:${hookName}`
      nodes.push({
        id: hookId,
        label: `${hookName} (module:${index + 1})`,
        kind: 'framework',
      })
      for (const dependency of hook.inject) {
        validateDeclaredDependency(dependency, hookId)
        addEdge({
          from: hookId,
          to: ensureNode(dependency),
          kind: 'lifecycle',
          source: 'declared',
        })
      }
    }
  })

  const recorder: DependencyRecorder = {
    record(consumer, dependency) {
      addEdge({
        from: ensureConsumerNode(consumer, nodes, ensureNode),
        to: ensureNode(dependency),
        kind: 'inject',
        source: 'probed',
      })
    },
  }
  const container = new Container([...providersByToken.values()], {
    recorder,
    probe: true,
  })
  const managedClasses = new Set<import('@loutrejs/core').Class>()
  for (const provider of providersByToken.values()) {
    if (provider.kind === 'class') managedClasses.add(provider.useClass)
    if (provider.kind === 'conditional') {
      for (const key of Reflect.ownKeys(provider.mapping)) {
        const candidate = provider.mapping[key]
        if (candidate) managedClasses.add(candidate)
      }
    }
  }
  for (const target of managedClasses) {
    try {
      container.probeClass(target)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      diagnostics.push({
        code: diagnosticCode(message),
        message,
        path: target.name,
      })
    }
  }

  const uniqueImplementations = [...new Set(descriptors)]
  uniqueImplementations.forEach((implementation, index) => {
    const consumer: ImplementationConsumer = {
      kind: 'implementation-consumer',
      id: ensureImplementationNode(implementation),
      name: implementation.name,
    }
    try {
      container.probeImplementation(implementation, consumer)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      diagnostics.push({
        code: diagnosticCode(message),
        message,
        path: `implementation:${index + 1}:${implementation.name}`,
      })
    }
  })

  entrypoints.forEach((entrypoint) => {
    const consumer: EntrypointConsumer = {
      kind: 'entrypoint-consumer',
      id: ensureEntrypointNode(entrypoint),
      name: entrypoint.name,
    }
    try {
      container.probeEntrypoint(entrypoint, consumer)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      diagnostics.push({
        code: diagnosticCode(message),
        message,
        path: consumer.id,
      })
    }
  })

  for (const target of targets) {
    visitPipelineItems(target.pipeline, (item, indexPath) => {
      if (item.kind !== 'layer') return
      const definition = layerDefinitionOf(item)
      const consumer: LayerConsumer = {
        kind: 'layer-consumer',
        id: `layer:${target.contractName}:${target.procedure}:${target.protocol}:${indexPath.join('.')}`,
        name: definition.name,
      }
      if (!nodes.some(({ id }) => id === consumer.id)) {
        nodes.push({ id: consumer.id, label: consumer.name, kind: 'layer' })
      }
      try {
        container.probeLayer(definition, consumer)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        diagnostics.push({
          code: diagnosticCode(message),
          message,
          path: consumer.id,
        })
      }
    })
  }

  return { nodes, edges }
}

function diagnosticCode(message: string): string {
  for (const code of [
    'LUTRE_ENV_001',
    'LUTRE_ENV_002',
    'LUTRE_ENV_004',
    'LUTRE_DI_CYCLE',
    'LUTRE_DI_ASYNC_FACTORY',
    'LUTRE_DI_CONSTRUCTOR',
    'LUTRE_IMPL_ASYNC_FACTORY',
    'LUTRE_IMPL_FACTORY_RESULT',
    'LUTRE_IMPL_004',
    'LUTRE_LAYER_ASYNC_FACTORY',
    'LUTRE_LAYER_FACTORY_RESULT',
    'LUTRE_ENTRYPOINT_ASYNC_FACTORY',
    'LUTRE_ENTRYPOINT_FACTORY_RESULT',
  ]) {
    if (message.includes(code)) return code
  }
  return 'LUTRE_DI_UNRESOLVED'
}

function validateDuplicateProviders(
  modules: readonly ModuleInstance[],
  diagnostics: Diagnostic[],
): void {
  const declarations = new Map<
    TokenLike,
    { readonly module: string; readonly provider: ProviderDescriptor }
  >()

  modules.forEach((module, moduleIndex) => {
    const moduleName = describeModule(module, moduleIndex)
    for (const declaration of module.definition.providers ?? []) {
      const provider = normalizeProvider(declaration)
      const existing = declarations.get(provider.provide)
      if (existing) {
        if (
          existing.provider.kind === 'environment' &&
          provider.kind === 'environment'
        ) {
          continue
        }
        if (
          existing.provider.kind === 'environment' ||
          provider.kind === 'environment'
        ) {
          diagnostics.push({
            code: 'LUTRE_ENV_001',
            message: `Environment ${tokenName(provider.provide)} is runtime-managed and cannot also be declared as a normal provider.`,
            path: `${moduleName}.environment.${tokenName(provider.provide)}`,
          })
          continue
        }
        diagnostics.push({
          code: 'LUTRE_DI_003',
          message: `Provider ${tokenName(provider.provide)}が${existing.module}と${moduleName}で重複しています`,
          path: `${moduleName}.providers.${tokenName(provider.provide)}`,
        })
        continue
      }
      declarations.set(provider.provide, { module: moduleName, provider })
    }
  })
}

function describeModule(module: ModuleInstance, index: number): string {
  const id = `module:${index + 1}`
  return module.definition.description === undefined
    ? id
    : `${id} (${module.definition.description})`
}

function collectCustomTokens(
  providers: readonly ProviderDescriptor[],
  targets: readonly ImplementationTarget[],
  diagnostics: Diagnostic[],
): ReadonlyMap<string, TokenLike> {
  const tokens = new Map<string, TokenLike>()
  const register = (candidate: TokenLike, path: string) => {
    if (typeof candidate === 'function') return
    const existing = tokens.get(candidate.id)
    if (existing && existing !== candidate) {
      diagnostics.push({
        code: 'LUTRE_TOKEN_001',
        message: `Token ID ${candidate.id}が異なるtoken declarationで重複しています`,
        path,
      })
      return
    }
    tokens.set(candidate.id, candidate)
  }

  for (const provider of providers) {
    register(provider.provide, `provider:${tokenName(provider.provide)}`)
    if (provider.kind === 'factory') {
      for (const dependency of provider.inject) {
        register(dependency, `provider:${tokenName(provider.provide)}`)
      }
    }
  }
  return tokens
}

function collectContextKeys(
  targets: readonly ImplementationTarget[],
  diagnostics: Diagnostic[],
): ReadonlyMap<string, ContextKey> {
  const keys = new Map<string, ContextKey>()
  for (const target of targets) {
    const path = `${target.contractName}.${target.procedure}.${target.protocol}`
    visitPipelineItems(target.pipeline, (item) => {
      if (item.kind !== 'layer') return
      for (const key of [...item.requires, ...item.provides]) {
        const existing = keys.get(key.name)
        if (existing && existing !== key) {
          diagnostics.push({
            code: 'LUTRE_CONTEXT_002',
            message: `Context Key ${key.name}が異なる宣言で重複しています`,
            path,
          })
          continue
        }
        keys.set(key.name, key)
      }
    })
  }
  return keys
}

export function assertValidCompilation(
  result: CompilationResult,
): ApplicationGraphIR {
  if (result.diagnostics.length > 0) {
    throw new StaticValidationError(result.diagnostics, result.graph)
  }
  return result.graph
}

function collectModules(
  roots: readonly (ModuleInstance | ModuleTemplate<void>)[],
): ModuleInstance[] {
  const modules: ModuleInstance[] = []
  const seen = new Set<ModuleInstance>()
  const visit = (candidate: ModuleInstance | ModuleTemplate<void>) => {
    const module = asModuleInstance(candidate)
    if (seen.has(module)) return
    seen.add(module)
    for (const imported of module.definition.imports ?? []) visit(imported)
    modules.push(module)
  }
  for (const root of roots) visit(root)
  return modules
}

function validateCoverage(
  implementations: readonly ImplementationDescriptor[],
  contractNames: Map<ContractDefinition, string>,
  diagnostics: Diagnostic[],
) {
  const contracts = new Set(
    implementations.map((implementation) => implementation.contract),
  )
  for (const contract of contracts) {
    const protocols = new Set(
      Object.values(contract.procedures).flatMap((procedure) =>
        Object.keys(procedure.protocols),
      ),
    )
    for (const protocol of protocols) {
      for (const [procedureName, procedure] of Object.entries(
        contract.procedures,
      )) {
        if (!(protocol in procedure.protocols)) continue
        const covering = implementations.filter(
          (implementation) =>
            implementation.contract === contract &&
            implementation.protocol === protocol &&
            implementation.procedures.includes(procedureName),
        )
        const path = `${contractNames.get(contract) ?? 'Contract'}.${procedureName}.${protocol}`
        if (covering.length === 0) {
          diagnostics.push({
            code: 'LUTRE_IMPL_001',
            message: `Missing implementation for ${path}`,
            path,
          })
        } else if (covering.length > 1) {
          diagnostics.push({
            code: 'LUTRE_IMPL_002',
            message: `Duplicate implementation for ${path}`,
            path,
          })
        }
      }
    }
  }
}

function validatePipeline(
  target: ImplementationTarget,
  diagnostics: Diagnostic[],
) {
  const path = `${target.contractName}.${target.procedure}.${target.protocol}`
  const flattened: {
    readonly item: PipelineItem
    readonly indexPath: readonly number[]
  }[] = []
  visitPipelineItems(target.pipeline, (item, indexPath) => {
    flattened.push({ item, indexPath })
  })
  const terminals = flattened.filter(({ item }) => item.kind === 'terminal')

  if (terminals.length !== 1) {
    diagnostics.push({
      code: 'LUTRE_PIPELINE_001',
      message: `Pipeline must contain exactly one ${target.protocol} terminal`,
      path,
    })
  } else {
    const terminal = terminals[0]!
    if (terminal !== flattened.at(-1)) {
      diagnostics.push({
        code: 'LUTRE_PIPELINE_002',
        message: `${terminal.item.name} must be the final Pipeline item`,
        path,
      })
    }
    if (
      terminal.item.kind === 'terminal' &&
      terminal.item.protocol !== target.protocol
    ) {
      diagnostics.push({
        code: 'LUTRE_PIPELINE_003',
        message: `${terminal.item.name} does not match protocol ${target.protocol}`,
        path,
      })
    }
  }

  const available = new Set<ContextKey>()
  const validated = new Set<string>()
  for (const { item } of flattened) {
    if (item.kind === 'validation') {
      validated.add(item.part)
      continue
    }
    if (item.kind !== 'layer') continue
    for (const required of item.requiresValidated) {
      if (!validated.has(required)) {
        diagnostics.push({
          code: 'LUTRE_VALIDATION_001',
          message: `${item.name}にはvalidation済みの${required}が必要ですが、validate.${required}より前に配置されています`,
          path,
        })
      }
    }
    for (const required of item.requires) {
      if (!available.has(required)) {
        diagnostics.push({
          code: 'LUTRE_PIPELINE_004',
          message: `${item.name}が必要とするContext Key ${contextKeyName(required)}は利用できません`,
          path,
        })
      }
    }
    for (const provided of item.provides) {
      if (available.has(provided)) {
        diagnostics.push({
          code: 'LUTRE_CONTEXT_003',
          message: `${item.name}は既存のContext Key ${contextKeyName(provided)}を暗黙に上書きできません`,
          path,
        })
      }
      available.add(provided)
    }
    for (const shortCircuit of item.shortCircuits) {
      if (shortCircuit.protocol !== target.protocol) continue
      const response = target.responses?.[shortCircuit.variant]
      if (!response) {
        diagnostics.push({
          code: 'LUTRE_SHORT_CIRCUIT_001',
          message: `${item.name}のshort circuit variant ${shortCircuit.variant}がresponseに宣言されていません`,
          path,
        })
        continue
      }
      const expectedStatus = shortCircuit.response?.status
      if (
        typeof expectedStatus === 'number' &&
        response.status !== expectedStatus
      ) {
        diagnostics.push({
          code: 'LUTRE_SHORT_CIRCUIT_002',
          message: `${item.name}のshort circuit variant ${shortCircuit.variant}はHTTP ${expectedStatus}である必要があります`,
          path,
        })
      }
    }
  }
}

function toLayerIR(item: PipelineItem, index: number): LayerIR {
  const child = item.kind === 'layer' ? childPipelineOf(item) : undefined
  return {
    index,
    name: item.name,
    role: item.role,
    requires: item.kind === 'layer' ? item.requires.map(contextKeyName) : [],
    provides: item.kind === 'layer' ? item.provides.map(contextKeyName) : [],
    requiresValidated: item.kind === 'layer' ? item.requiresValidated : [],
    ...(child === undefined ? {} : { pipeline: child.map(toLayerIR) }),
    ...(item.kind !== 'layer' || item.shortCircuits.length === 0
      ? {}
      : {
          shortCircuits: item.shortCircuits.map(
            (shortCircuit: ShortCircuitDeclaration) => ({
              protocol: shortCircuit.protocol,
              variant: shortCircuit.variant,
              ...(shortCircuit.response === undefined
                ? {}
                : { response: shortCircuit.response }),
            }),
          ),
        }),
  }
}

function visitPipelineItems(
  pipeline: readonly PipelineItem[],
  visit: (item: PipelineItem, indexPath: readonly number[]) => void,
  parentPath: readonly number[] = [],
): void {
  pipeline.forEach((item, index) => {
    const indexPath = [...parentPath, index]
    visit(item, indexPath)
    if (item.kind === 'layer') {
      const child = childPipelineOf(item)
      if (child) visitPipelineItems(child, visit, indexPath)
    }
  })
}

function ensureConsumerNode(
  consumer: DependencyConsumer,
  nodes: DependencyNodeIR[],
  ensureTokenNode: (token: TokenLike) => string,
): string {
  if (typeof consumer === 'function' || consumer.kind === 'token') {
    return ensureTokenNode(consumer)
  }
  if (!nodes.some(({ id }) => id === consumer.id)) {
    nodes.push({
      id: consumer.id,
      label: consumer.name,
      kind:
        consumer.kind === 'implementation-consumer'
          ? 'implementation'
          : consumer.kind === 'entrypoint-consumer'
            ? 'entrypoint'
            : 'layer',
    })
  }
  return consumer.id
}

function dedupeProviders(
  providers: readonly ProviderDescriptor[],
): readonly ProviderDescriptor[] {
  const result: ProviderDescriptor[] = []
  const seenEnvironment = new Set<TokenLike>()
  for (const provider of providers) {
    if (provider.kind === 'environment') {
      if (seenEnvironment.has(provider.provide)) continue
      seenEnvironment.add(provider.provide)
    }
    result.push(provider)
  }
  return result
}
