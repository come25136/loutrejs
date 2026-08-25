import {
  asModuleInstance,
  childPipelineOf,
  contextKeyName,
  layerDefinitionOf,
  normalizeProvider,
  tokenName,
  type ContractDefinition,
  type ContextKey,
  type DependencyConsumer,
  type ImplementationBinding,
  type ModuleInstance,
  type ModuleTemplate,
  type PipelineItem,
  type ProviderDescriptor,
  type LayerConsumer,
  type ShortCircuitDeclaration,
  type TokenLike,
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
} from './ir.js'

interface BindingTarget {
  readonly binding: ImplementationBinding
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
    super(diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`).join('\n'))
    this.name = 'StaticValidationError'
  }
}

export function compileApplication(
  roots: readonly (ModuleInstance | ModuleTemplate<void>)[],
): CompilationResult {
  const modules = collectModules(roots)
  const providers = modules.flatMap((module) =>
    (module.definition.providers ?? []).map(normalizeProvider),
  )
  const diagnostics: Diagnostic[] = []
  const contractNames = new Map<ContractDefinition, string>()
  let contractSequence = 0
  const nameContract = (contract: ContractDefinition) => {
    const current = contractNames.get(contract)
    if (current) return current
    const name = contract.name ?? `Contract${++contractSequence}`
    contractNames.set(contract, name)
    return name
  }

  const bindings = modules.flatMap(
    (module) => module.definition.implementations ?? [],
  )
  const targets: BindingTarget[] = []

  for (const binding of bindings) {
    const availableProcedures = Object.entries(binding.contract.procedures)
      .filter(([, procedure]) => binding.protocol in procedure.protocols)
      .map(([name]) => name)
    const selected = binding.procedures ?? availableProcedures

    for (const procedureName of selected) {
      const procedure = binding.contract.procedures[procedureName]
      const protocol = procedure?.protocols[binding.protocol] as
        | ({
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
          })
        | undefined
      if (!procedure || !protocol) {
        diagnostics.push({
          code: 'LUTRE_IMPL_003',
          message: `${procedureName} is not declared for protocol ${binding.protocol}`,
          path: `${nameContract(binding.contract)}.${procedureName}.${binding.protocol}`,
        })
        continue
      }
      targets.push({
        binding,
        contractName: nameContract(binding.contract),
        procedure: procedureName,
        protocol: binding.protocol,
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
  validateCoverage(bindings, contractNames, diagnostics)
  validateDuplicateProviders(modules, diagnostics)

  const tokensById = collectCustomTokens(providers, targets, diagnostics)
  const contextKeysByName = collectContextKeys(targets, diagnostics)

  const pipelines: PipelineIR[] = []
  const implementations: ImplementationIR[] = []
  for (const target of targets) {
    validatePipeline(target, diagnostics)
    const method = target.binding.implementation.prototype[target.procedure] as unknown
    if (typeof method !== 'function') {
      diagnostics.push({
        code: 'LUTRE_IMPL_004',
        message: `${target.binding.implementation.name} does not implement method ${target.procedure}`,
        path: `${target.contractName}.${target.procedure}.${target.protocol}`,
      })
    }

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
      implementation: target.binding.implementation.name,
      method: target.procedure,
    })
  }

  const dependencyGraph = buildDependencyGraph(
    modules,
    bindings,
    targets,
    diagnostics,
  )
  const probedTokenIds = dependencyGraph.nodes
    .filter((node) => node.kind === 'token')
    .map((node) => node.label)
  const graph: ApplicationGraphIR = {
    version: 2,
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
      providers: (module.definition.providers ?? []).map((provider) =>
        tokenName(normalizeProvider(provider).provide),
      ),
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
    providers: providers.map((provider) => ({
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
    tokens: [...new Set([...tokensById.keys(), ...probedTokenIds])]
      .map((id) => ({ id })),
    contextKeys: [...contextKeysByName.keys()].map((name) => ({ name })),
    contracts: [...contractNames.values()],
    pipelines,
    implementations,
    capabilities: [
      ...targets.flatMap((target) => {
        const requiredBy = `${target.contractName}.${target.procedure}`
        return [
          { name: 'crypto.random', requiredBy },
          ...(target.protocol === 'http'
            ? [{ name: 'http.server', requiredBy }]
            : []),
          ...(target.protocol === 'messagePort'
            ? [
                { name: 'messagePort.send', requiredBy },
                { name: 'messagePort.receive', requiredBy },
              ]
            : []),
          ...(target.interaction === 'server-stream'
            ? [
                { name: 'stream.readable', requiredBy },
                ...(target.protocol === 'http'
                  ? [{ name: 'http.response.streaming', requiredBy }]
                  : []),
              ]
            : []),
        ]
      }),
      ...modules.flatMap((module, index) =>
        (module.definition.requires ?? []).map((name) => ({
          name,
          requiredBy: `module:${index + 1}`,
        })),
      ),
    ],
    ...dependencyGraph,
    diagnostics,
  }

  return { graph, diagnostics }
}

function validateDispatchKeys(
  targets: readonly BindingTarget[],
  diagnostics: Diagnostic[],
): void {
  const targetsByKey = new Map<string, BindingTarget>()
  for (const target of targets) {
    if (target.dispatchKey === null) continue
    const path = `${target.contractName}.${target.procedure}.${target.protocol}`
    const existing = targetsByKey.get(target.dispatchKey)
    if (existing) {
      if (
        existing.binding.contract === target.binding.contract &&
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

export function validateGraph(graph: ApplicationGraphIR): readonly Diagnostic[] {
  return graph.diagnostics
}

function buildDependencyGraph(
  modules: readonly ModuleInstance[],
  bindings: readonly ImplementationBinding[],
  targets: readonly BindingTarget[],
  diagnostics: Diagnostic[],
): Pick<ApplicationGraphIR, 'nodes' | 'edges'> {
  const nodes: DependencyNodeIR[] = []
  const edges: DependencyEdgeIR[] = []
  const ids = new Map<TokenLike, string>()
  const modulesByProvider = new Map<TokenLike, string>()
  const providersByToken = new Map<TokenLike, ProviderDescriptor>()
  const implementationClasses = new Set(
    bindings.map((binding) => binding.implementation as TokenLike),
  )
  const customTokensById = new Map<string, TokenLike>()

  modules.forEach((module, index) => {
    const moduleId = `module:${index + 1}`
    for (const declaration of module.definition.providers ?? []) {
      const provider = normalizeProvider(declaration)
      modulesByProvider.set(provider.provide, moduleId)
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
      if (registered && registered !== token && !diagnostics.some(
        (diagnostic) => diagnostic.code === 'LUTRE_TOKEN_001' && diagnostic.message.includes(token.id),
      )) {
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
    const base = typeof token === 'function' ? `class:${token.name}` : `token:${token.id}`
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
        (implementationClasses.has(token)
          ? 'implementation'
          : typeof token === 'function'
            ? 'class'
            : 'token'),
      ...(scope === undefined ? {} : { scope }),
      ...(module === undefined ? {} : { module }),
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
    ) return
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
          message: 'Async factory providers are not supported. Move asynchronous resource initialization to application lifecycle.',
          path: tokenName(provider.provide),
        })
      }
    }
    if (provider.kind === 'conditional') {
      validateDeclaredDependency(provider.select.env, tokenName(provider.provide))
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

  for (const binding of bindings) {
    ensureNode(binding.implementation, { kind: 'implementation', scope: 'application' })
  }

  modules.forEach((module, index) => {
    const lifecycle = module.definition.lifecycle
    if (!lifecycle) return
    for (const [hookName, hook] of Object.entries(lifecycle)) {
      if (!hook) continue
      const hookId = `lifecycle:module:${index + 1}:${hookName}`
      nodes.push({ id: hookId, label: `${hookName} (module:${index + 1})`, kind: 'framework' })
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
  const container = new Container([...providersByToken.values()], { recorder })
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
  for (const binding of bindings) managedClasses.add(binding.implementation)

  for (const target of managedClasses) {
    try {
      container.probeClass(target)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      diagnostics.push({
        code: message.includes('LUTRE_DI_CYCLE') ? 'LUTRE_DI_CYCLE' :
          message.includes('LUTRE_DI_ASYNC_FACTORY') ? 'LUTRE_DI_ASYNC_FACTORY' :
          message.includes('LUTRE_DI_CONSTRUCTOR') ? 'LUTRE_DI_CONSTRUCTOR' :
          'LUTRE_DI_UNRESOLVED',
        message,
        path: target.name,
      })
    }
  }

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
          code: message.includes('LUTRE_DI_CYCLE') ? 'LUTRE_DI_CYCLE' :
            message.includes('LUTRE_LAYER_ASYNC_FACTORY') ? 'LUTRE_LAYER_ASYNC_FACTORY' :
            message.includes('LUTRE_LAYER_FACTORY_RESULT') ? 'LUTRE_LAYER_FACTORY_RESULT' :
            'LUTRE_DI_UNRESOLVED',
          message,
          path: consumer.id,
        })
      }
    })
  }

  return { nodes, edges }
}

function validateDuplicateProviders(
  modules: readonly ModuleInstance[],
  diagnostics: Diagnostic[],
): void {
  const declarations = new Map<
    TokenLike,
    { readonly module: string }
  >()

  modules.forEach((module, moduleIndex) => {
    const moduleName = describeModule(module, moduleIndex)
    for (const declaration of module.definition.providers ?? []) {
      const provider = normalizeProvider(declaration)
      const existing = declarations.get(provider.provide)
      if (existing) {
        diagnostics.push({
          code: 'LUTRE_DI_003',
          message: `Provider ${tokenName(provider.provide)}が${existing.module}と${moduleName}で重複しています`,
          path: `${moduleName}.providers.${tokenName(provider.provide)}`,
        })
        continue
      }
      declarations.set(provider.provide, { module: moduleName })
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
  targets: readonly BindingTarget[],
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
  targets: readonly BindingTarget[],
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

export function assertValidCompilation(result: CompilationResult): ApplicationGraphIR {
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
  bindings: readonly ImplementationBinding[],
  contractNames: Map<ContractDefinition, string>,
  diagnostics: Diagnostic[],
) {
  const contracts = new Set(bindings.map((binding) => binding.contract))
  for (const contract of contracts) {
    const protocols = new Set(
      Object.values(contract.procedures).flatMap((procedure) =>
        Object.keys(procedure.protocols),
      ),
    )
    for (const protocol of protocols) {
      for (const [procedureName, procedure] of Object.entries(contract.procedures)) {
        if (!(protocol in procedure.protocols)) continue
        const covering = bindings.filter(
          (binding) =>
            binding.contract === contract &&
            binding.protocol === protocol &&
            (binding.procedures === undefined ||
              binding.procedures.includes(procedureName)),
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
  target: BindingTarget,
  diagnostics: Diagnostic[],
) {
  const path = `${target.contractName}.${target.procedure}.${target.protocol}`
  const flattened: { readonly item: PipelineItem, readonly indexPath: readonly number[] }[] = []
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
    requires:
      item.kind === 'layer' ? item.requires.map(contextKeyName) : [],
    provides:
      item.kind === 'layer' ? item.provides.map(contextKeyName) : [],
    requiresValidated:
      item.kind === 'layer' ? item.requiresValidated : [],
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
    nodes.push({ id: consumer.id, label: consumer.name, kind: 'layer' })
  }
  return consumer.id
}
