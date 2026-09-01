import {
  argumentsProvider,
  asModuleInstance,
  childPipelineOf,
  contextKeyName,
  defineModule,
  isArgsClass,
  isEnvClass,
  layerDefinitionOf,
  normalizeProvider,
  queueRuntimeToken,
  tokenName,
  type ArgsClass,
  type ContractBinding,
  type ContractDefinition,
  type ContextKey,
  type DependencyConsumer,
  type ImplementationConsumer,
  type ImplementationDescriptor,
  type LayerConsumer,
  type ModuleInstance,
  type ModuleTemplate,
  type PipelineItem,
  type ProviderDescriptor,
  type QueueDescriptor,
  type ShortCircuitDeclaration,
  type StandardSchemaV1,
  type TaskConsumer,
  type TaskDescriptor,
  type TokenLike,
  type TriggerDescriptor,
} from '../core/index.js'
import {
  contractNodeMetadataOf,
  contractOfBinding,
  contractProcedurePathOf,
  contractRootOf,
} from '../core/contract-internal.js'
import { Container, Logger, type DependencyRecorder } from '../runtime/index.js'
import type {
  ApplicationGraphIR,
  CompilationResult,
  DependencyEdgeIR,
  DependencyNodeIR,
  Diagnostic,
  ContractId,
  ContractIR,
  ImplementationId,
  ImplementationIR,
  LayerIR,
  PipelineIR,
  QueueIR,
  ExecutionRootIR,
  TaskIR,
} from './ir.js'

interface ImplementationTarget {
  readonly implementation: ImplementationDescriptor
  readonly contractId: ContractId
  readonly implementationId: ImplementationId
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

export interface ApplicationCompilationInput {
  readonly contract?: ContractBinding
  readonly modules: readonly (ModuleInstance | ModuleTemplate<void>)[]
  readonly arguments?: ArgsClass | undefined
  readonly tasks?: readonly TaskDescriptor<any, any>[]
  readonly triggers?: readonly TriggerDescriptor[]
}

export function compileApplication(
  input: ApplicationCompilationInput,
): CompilationResult {
  const publicTasks = input.tasks ?? []
  const triggers = input.triggers ?? []
  const tasks = uniqueTasks([
    ...publicTasks,
    ...triggers.map((trigger) => trigger.task),
  ])
  const argumentModule = input.arguments
    ? defineModule(() => ({
        name: '@loutrejs/application-arguments',
        providers: [argumentsProvider(input.arguments!)],
      }))()
    : undefined
  const modules = collectModules(
    argumentModule ? [...input.modules, argumentModule] : input.modules,
  )
  const visibleModules = argumentModule
    ? modules.filter((module) => module !== argumentModule)
    : modules
  const providers = modules.flatMap((module) =>
    (module.definition.providers ?? []).map(normalizeProvider),
  )
  const queueTriggers = triggers.filter(
    (
      trigger,
    ): trigger is Extract<
      TriggerDescriptor,
      { readonly trigger: 'queue-consumer' }
    > => trigger.trigger === 'queue-consumer',
  )
  const queues = uniqueQueues(queueTriggers.map((trigger) => trigger.queue))
  const diagnostics: Diagnostic[] = []
  validateNamedDescriptors(tasks, 'LUTRE_TASK_001', diagnostics)
  validateNamedDescriptors(triggers, 'LUTRE_TRIGGER_DUPLICATE', diagnostics)
  validateNamedDescriptors(queues, 'LUTRE_QUEUE_DUPLICATE', diagnostics)
  validateCronTriggers(triggers, diagnostics)
  diagnostics.push(...validateQueueDrivers(input.modules, queueTriggers))

  const applicationContract =
    input.contract === undefined ? undefined : contractOfBinding(input.contract)
  const contractIds = new Map<ContractDefinition, ContractId>()
  const idContract = (contract: ContractDefinition): ContractId => {
    const current = contractIds.get(contract)
    if (current) return current
    const id = `contract:${contractIds.size + 1}` as const
    contractIds.set(contract, id)
    return id
  }

  const implementationIds = new Map<
    ImplementationDescriptor,
    ImplementationId
  >()
  const idImplementation = (
    implementation: ImplementationDescriptor,
  ): ImplementationId => {
    const current = implementationIds.get(implementation)
    if (current) return current
    const id = `implementation:${implementationIds.size + 1}` as const
    implementationIds.set(implementation, id)
    return id
  }

  if (applicationContract) idContract(applicationContract)

  const descriptors = modules.flatMap(
    (module) => module.definition.implementations ?? [],
  )
  for (const implementation of new Set(descriptors)) {
    const firstProcedure = implementation.procedures[0]
    const identity =
      firstProcedure === undefined
        ? { contract: contractRootOf(implementation.contract) }
        : resolveImplementationTargetIdentity(
            implementation.contract,
            firstProcedure,
            applicationContract,
          )
    idContract(identity.contract)
    idImplementation(implementation)
  }
  const targets: ImplementationTarget[] = []

  for (const implementation of descriptors) {
    for (const procedureName of implementation.procedures) {
      const identity = resolveImplementationTargetIdentity(
        implementation.contract,
        procedureName,
        applicationContract,
      )
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
          path: `${idContract(identity.contract)}.${identity.procedure}.${implementation.protocol}`,
        })
        continue
      }
      targets.push({
        implementation,
        contractId: idContract(identity.contract),
        implementationId: idImplementation(implementation),
        procedure: identity.procedure,
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
  validateCoverage(
    descriptors,
    targets,
    contractIds,
    diagnostics,
    applicationContract,
  )
  validateDuplicateProviders(modules, diagnostics)

  const tokensById = collectCustomTokens(providers, targets, diagnostics)
  const contextKeysByName = collectContextKeys(targets, diagnostics)

  const pipelines: PipelineIR[] = []
  for (const target of targets) {
    validatePipeline(target, diagnostics)

    pipelines.push({
      contract: target.contractId,
      procedure: target.procedure,
      protocol: target.protocol,
      layers: target.pipeline.map(toLayerIR),
    })
  }
  const implementations: ImplementationIR[] = [...new Set(descriptors)].map(
    (implementation) => {
      const implementationTargets = targets.filter(
        (target) => target.implementation === implementation,
      )
      return {
        id: idImplementation(implementation),
        name: implementation.name,
        contract:
          implementationTargets[0]?.contractId ??
          idContract(contractRootOf(implementation.contract)),
        protocol: implementation.protocol,
        procedures: implementationTargets.map((target) => target.procedure),
      }
    },
  )

  const dependencyGraph = buildDependencyGraph(
    modules,
    descriptors,
    targets,
    tasks,
    diagnostics,
  )
  const probedTokenIds = dependencyGraph.nodes
    .filter((node) => node.kind === 'token')
    .map((node) => node.label)
  const publicTaskSet = new Set(publicTasks)
  const graph: ApplicationGraphIR = {
    modules: visibleModules.map((module) => {
      const index = modules.indexOf(module)
      return {
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
      }
    }),
    ...(input.arguments ? { arguments: { name: input.arguments.name } } : {}),
    providers: dedupeProviders(providers).map((provider) => ({
      token: tokenName(provider.provide),
      kind: provider.kind,
      scope: provider.scope,
      dependencies:
        provider.kind === 'factory'
          ? provider.inject.map(tokenName)
          : provider.kind === 'conditional'
            ? [tokenName(provider.select.contract)]
            : [],
    })),
    tokens: [...new Set([...tokensById.keys(), ...probedTokenIds])].map(
      (id) => ({ id }),
    ),
    contextKeys: [...contextKeysByName.keys()].map((name) => ({ name })),
    contracts: [...contractIds.entries()].map(([contract, id]) =>
      toContractIR(contract, id),
    ),
    pipelines,
    implementations,
    tasks: tasks.map<TaskIR>((task) => ({
      id: `task:${task.name}`,
      name: task.name,
      public: publicTaskSet.has(task),
    })),
    queues: queues.map(toQueueIR),
    executions: [
      ...targets.map<ExecutionRootIR>((target) => ({
        id: `protocol:${target.contractId}:${target.procedure}:${target.protocol}`,
        kind: 'protocol',
        protocol: target.protocol,
        contract: target.contractId,
        procedure: target.procedure,
        implementation: target.implementationId,
      })),
      ...publicTasks.map<ExecutionRootIR>((task) => ({
        id: `task:${task.name}`,
        kind: 'task',
        name: task.name,
      })),
      ...triggers.map(toTriggerExecution),
    ],
    capabilities: [
      ...targets.flatMap((target) => {
        const requiredBy = `${target.contractId}.${target.procedure}`
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
      ...visibleModules.flatMap((module) => {
        const index = modules.indexOf(module)
        return [
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
        ]
      }),
      ...(input.arguments
        ? [
            {
              name: 'args.runtime',
              scope: 'application' as const,
              requiredBy: 'application',
            },
          ]
        : []),
    ],
    hostCapabilities: collectHostCapabilities(input.modules),
    ...dependencyGraph,
    diagnostics,
  }

  return { graph, diagnostics }
}

function resolveImplementationTargetIdentity(
  contract: ContractDefinition,
  procedure: string,
  applicationContract: ContractDefinition | undefined,
): { readonly contract: ContractDefinition; readonly procedure: string } {
  if (applicationContract && contract === applicationContract) {
    return { contract: applicationContract, procedure }
  }

  const canonicalProcedure = contractProcedurePathOf(contract, procedure)
  if (applicationContract) {
    const applicationNode = contractNodeMetadataOf(applicationContract)
    const implementationNode = contractNodeMetadataOf(contract)
    if (
      applicationNode &&
      implementationNode &&
      applicationNode.root === implementationNode.root &&
      isPathPrefix(applicationNode.path, implementationNode.path)
    ) {
      const prefix = applicationNode.path.slice(1).join('.')
      const relativeProcedure = canonicalProcedure.startsWith(`${prefix}.`)
        ? canonicalProcedure.slice(prefix.length + 1)
        : canonicalProcedure
      return { contract: applicationContract, procedure: relativeProcedure }
    }
  }

  return {
    contract: contractRootOf(contract),
    procedure: canonicalProcedure,
  }
}

function isPathPrefix(
  prefix: readonly string[],
  candidate: readonly string[],
): boolean {
  return (
    prefix.length <= candidate.length &&
    prefix.every((segment, index) => candidate[index] === segment)
  )
}

function validateDispatchKeys(
  targets: readonly ImplementationTarget[],
  diagnostics: Diagnostic[],
): void {
  const targetsByKey = new Map<string, ImplementationTarget>()
  for (const target of targets) {
    if (target.dispatchKey === null) continue
    const path = `${target.contractId}.${target.procedure}.${target.protocol}`
    const existing = targetsByKey.get(target.dispatchKey)
    if (existing) {
      if (
        existing.contractId === target.contractId &&
        existing.procedure === target.procedure &&
        existing.protocol === target.protocol
      ) {
        continue
      }
      const existingPath = `${existing.contractId}.${existing.procedure}.${existing.protocol}`
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

function validateCronTriggers(
  triggers: readonly TriggerDescriptor[],
  diagnostics: Diagnostic[],
): void {
  for (const trigger of triggers) {
    if (trigger.trigger !== 'cron') continue
    if (!isValidCronExpression(trigger.expression)) {
      diagnostics.push({
        code: 'LUTRE_TRIGGER_INVALID_CRON',
        message: `Trigger ${trigger.name} must use a portable 5-field cron expression.`,
        path: `trigger:${trigger.name}`,
      })
    }
    try {
      new Intl.DateTimeFormat('en-US', {
        timeZone: trigger.timezone,
      }).format()
    } catch {
      diagnostics.push({
        code: 'LUTRE_TRIGGER_INVALID_TIMEZONE',
        message: `Trigger ${trigger.name} must use a valid IANA timezone.`,
        path: `trigger:${trigger.name}`,
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

function uniqueTasks(
  tasks: readonly TaskDescriptor<any, any>[],
): readonly TaskDescriptor<any, any>[] {
  return [...new Set(tasks)]
}

function uniqueQueues(queues: readonly QueueDescriptor[]): QueueDescriptor[] {
  return [...new Set(queues)]
}

function toTriggerExecution(trigger: TriggerDescriptor): ExecutionRootIR {
  switch (trigger.trigger) {
    case 'cron':
      return {
        id: `trigger:${trigger.name}`,
        kind: 'trigger',
        trigger: 'cron',
        name: trigger.name,
        expression: trigger.expression,
        timezone: trigger.timezone,
        overlap: trigger.overlap,
        task: trigger.task.name,
      }
    case 'fixed-delay':
      return {
        id: `trigger:${trigger.name}`,
        kind: 'trigger',
        trigger: 'fixed-delay',
        name: trigger.name,
        delay: trigger.delay,
        immediate: trigger.immediate,
        task: trigger.task.name,
      }
    case 'queue-consumer':
      return {
        id: `trigger:${trigger.name}`,
        kind: 'trigger',
        trigger: 'queue-consumer',
        name: trigger.name,
        queue: trigger.queue.name,
        task: trigger.task.name,
      }
  }
}

function toQueueIR(queue: QueueDescriptor): QueueIR {
  return {
    id: `queue:${queue.name}`,
    name: queue.name,
    payloadSchema: schemaIdentity(queue.payload),
  }
}

function schemaIdentity(schema: StandardSchemaV1): string {
  const standard = schema['~standard'] as {
    readonly vendor?: unknown
    readonly version?: unknown
  }
  const vendor =
    typeof standard.vendor === 'string' ? standard.vendor : 'standard-schema'
  const version =
    typeof standard.version === 'number' || typeof standard.version === 'string'
      ? String(standard.version)
      : '1'
  return `${vendor}@${version}`
}

function validateQueueDrivers(
  roots: readonly (ModuleInstance | ModuleTemplate<void>)[],
  triggers: readonly Extract<
    TriggerDescriptor,
    { readonly trigger: 'queue-consumer' }
  >[],
): Diagnostic[] {
  const providers = collectModules(roots).flatMap((module) =>
    (module.definition.providers ?? []).map(normalizeProvider),
  )
  return triggers.flatMap((trigger) => {
    const runtimeToken = queueRuntimeToken(trigger.queue)
    return providers.some((provider) => provider.provide === runtimeToken)
      ? []
      : [
          {
            code: 'LUTRE_QUEUE_DRIVER_UNBOUND',
            message: `Queue ${trigger.queue.name} has a consumer trigger but no runtime driver binding.`,
            path: `trigger:${trigger.name}`,
          },
        ]
  })
}

function collectHostCapabilities(
  roots: readonly (ModuleInstance | ModuleTemplate<void>)[],
): string[] {
  return [
    ...new Set(
      collectModules(roots).flatMap((module) =>
        (module.definition.implementations ?? []).flatMap(
          (implementation) => implementation.capabilities,
        ),
      ),
    ),
  ]
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
  tasks: readonly TaskDescriptor<any, any>[],
  diagnostics: Diagnostic[],
): Pick<ApplicationGraphIR, 'nodes' | 'edges'> {
  const nodes: DependencyNodeIR[] = []
  const edges: DependencyEdgeIR[] = []
  const ids = new Map<TokenLike, string>()
  const implementationIds = new Map<ImplementationDescriptor, string>()
  const taskIds = new Map<TaskDescriptor<any, any>, string>()
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
          message: `Token ID ${token.id} is duplicated across different token declarations`,
          path: `dependency:${token.id}`,
        })
      } else if (!registered) {
        customTokensById.set(token.id, token)
      }
    }
    const current = ids.get(token)
    if (current) return current
    const base = isArgsClass(token)
      ? `arguments:${token.name}`
      : typeof token === 'function'
        ? `class:${token.name}`
        : `token:${token.id}`
    let id = base
    let sequence = 2
    while (nodes.some((node) => node.id === id)) id = `${base}:${sequence++}`
    ids.set(token, id)
    const provider = providersByToken.get(token)
    const scope = overrides.scope ?? provider?.scope
    const module =
      provider?.kind === 'arguments'
        ? undefined
        : (overrides.module ?? modulesByProvider.get(token))
    nodes.push({
      id,
      label: tokenName(token),
      kind:
        overrides.kind ??
        (provider?.kind === 'environment' || isEnvClass(token)
          ? 'environment'
          : provider?.kind === 'arguments' || isArgsClass(token)
            ? 'arguments'
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

  const ensureTaskNode = (task: TaskDescriptor<any, any>): string => {
    const current = taskIds.get(task)
    if (current) return current
    const id = `task:${task.name}`
    taskIds.set(task, id)
    nodes.push({
      id,
      label: task.name,
      kind: 'task',
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
    if (isArgsClass(dependency)) {
      diagnostics.push({
        code: 'LUTRE_ARGS_002',
        message: `${dependency.name} is injected but is not declared by Application.arguments.`,
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
        provider.select.contract,
        tokenName(provider.provide),
      )
      addEdge({
        from: providerId,
        to: ensureNode(provider.select.contract),
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
          condition: {
            source: provider.select.source,
            contract: tokenName(provider.select.contract),
            key: provider.select.key,
            equals,
          },
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
  const managedClasses = new Set<import('../core/index.js').Class>()
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

  tasks.forEach((task) => {
    const consumer: TaskConsumer = {
      kind: 'task-consumer',
      id: ensureTaskNode(task),
      name: task.name,
    }
    try {
      container.probeTask(task, consumer)
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
        id: `layer:${target.contractId}/${target.procedure}/${target.protocol}/${indexPath.join('.')}`,
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
    'LUTRE_ARGS_001',
    'LUTRE_ARGS_002',
    'LUTRE_DI_CYCLE',
    'LUTRE_DI_ASYNC_FACTORY',
    'LUTRE_DI_CONSTRUCTOR',
    'LUTRE_IMPL_ASYNC_FACTORY',
    'LUTRE_IMPL_FACTORY_RESULT',
    'LUTRE_IMPL_004',
    'LUTRE_LAYER_ASYNC_FACTORY',
    'LUTRE_LAYER_FACTORY_RESULT',
    'LUTRE_TASK_ASYNC_FACTORY',
    'LUTRE_TASK_FACTORY_RESULT',
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
          message: `Provider ${tokenName(provider.provide)} is duplicated in ${existing.module} and ${moduleName}`,
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
        message: `Token ID ${candidate.id} is duplicated across different token declarations`,
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
    const path = `${target.contractId}.${target.procedure}.${target.protocol}`
    visitPipelineItems(target.pipeline, (item) => {
      if (item.kind !== 'layer') return
      for (const key of [...item.requires, ...item.provides]) {
        const existing = keys.get(key.name)
        if (existing && existing !== key) {
          diagnostics.push({
            code: 'LUTRE_CONTEXT_002',
            message: `Context Key ${key.name} is duplicated across different declarations`,
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

function toContractIR(
  contract: ContractDefinition,
  id: ContractId,
): ContractIR {
  return {
    id,
    procedures: Object.entries(contract.procedures).map(
      ([procedureName, procedure]) => ({
        name: procedureName,
        protocols: Object.entries(procedure.protocols).map(
          ([protocolName, protocol]) => ({
            name: protocolName,
            dispatchKey: protocol.dispatchKey,
            interaction: protocol.interaction ?? 'unary',
          }),
        ),
      }),
    ),
  }
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
  targets: readonly ImplementationTarget[],
  contractIds: Map<ContractDefinition, ContractId>,
  diagnostics: Diagnostic[],
  applicationContract?: ContractDefinition,
) {
  const contracts = applicationContract
    ? [applicationContract]
    : [
        ...new Set(
          implementations.map((implementation) =>
            contractRootOf(implementation.contract),
          ),
        ),
      ]

  for (const contract of contracts) {
    const contractId = contractIds.get(contract) ?? 'contract:unknown'
    for (const [procedureName, procedure] of Object.entries(
      contract.procedures,
    )) {
      for (const protocol of Object.keys(procedure.protocols)) {
        const covering = targets.filter(
          (target) =>
            target.contractId === contractId &&
            target.protocol === protocol &&
            target.procedure === procedureName,
        )
        const path = `${contractId}.${procedureName}.${protocol}`
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
  const path = `${target.contractId}.${target.procedure}.${target.protocol}`
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
          message: `${item.name} requires validated ${required} but appears before validate.${required}`,
          path,
        })
      }
    }
    for (const required of item.requires) {
      if (!available.has(required)) {
        diagnostics.push({
          code: 'LUTRE_PIPELINE_004',
          message: `Context Key ${contextKeyName(required)} required by ${item.name} is unavailable`,
          path,
        })
      }
    }
    for (const provided of item.provides) {
      if (available.has(provided)) {
        diagnostics.push({
          code: 'LUTRE_CONTEXT_003',
          message: `${item.name} cannot implicitly overwrite existing Context Key ${contextKeyName(provided)}`,
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
          message: `Short-circuit variant ${shortCircuit.variant} from ${item.name} is not declared in the response`,
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
          message: `Short-circuit variant ${shortCircuit.variant} from ${item.name} must use HTTP ${expectedStatus}`,
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
          : consumer.kind === 'task-consumer'
            ? 'task'
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
