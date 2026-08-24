import {
  asModuleInstance,
  contextKeyName,
  getExplicitInjections,
  normalizeProvider,
  tokenName,
  type ContractDefinition,
  type ContextKey,
  type ImplementationBinding,
  type ModuleInstance,
  type ModuleTemplate,
  type PipelineItem,
  type ProviderDescriptor,
  type TokenLike,
} from '@loutrefw/core'
import type {
  ApplicationGraphIR,
  CompilationResult,
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
  readonly pipeline: readonly PipelineItem[]
  readonly interaction: string
}

export class StaticValidationError extends Error {
  constructor(readonly diagnostics: readonly Diagnostic[]) {
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
    const name = `Contract${++contractSequence}`
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
            readonly definition?: {
              readonly pipeline?: readonly PipelineItem[]
              readonly interaction?: string
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
        pipeline: protocol.pipeline ?? protocol.definition?.pipeline ?? [],
        interaction:
          protocol.interaction ?? protocol.definition?.interaction ?? 'unary',
      })
    }
  }

  validateCoverage(bindings, contractNames, diagnostics)

  const tokensById = collectCustomTokens(providers, targets, diagnostics)
  const contextKeysByName = collectContextKeys(targets, diagnostics)

  const providersByToken = new Map<TokenLike, ProviderDescriptor>(
    providers.map((provider) => [provider.provide, provider]),
  )
  const pipelines: PipelineIR[] = []
  const implementations: ImplementationIR[] = []
  for (const target of targets) {
    validatePipeline(target, providersByToken, diagnostics)
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

  const graph: ApplicationGraphIR = {
    version: 1,
    modules: modules.map((module, index) => ({
      id: `module:${index + 1}`,
      ...(module.definition.description === undefined
        ? {}
        : { description: module.definition.description }),
      imports: (module.definition.imports ?? []).map((imported) => {
        const importedIndex = modules.indexOf(imported)
        return `module:${importedIndex + 1}`
      }),
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
      requires: module.definition.requires ?? [],
    })),
    providers: providers.map((provider) => ({
      token: tokenName(provider.provide),
      kind: provider.kind,
      scope: provider.scope,
      dependencies:
        provider.kind === 'factory'
          ? provider.inject.map(tokenName)
          : provider.kind === 'class'
            ? [...getExplicitInjections(provider.useClass).values()].map(tokenName)
            : provider.kind === 'conditional'
              ? [provider.select.env.name]
              : [],
    })),
    tokens: [...tokensById.keys()].map((id) => ({ id })),
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
  }

  return { graph, diagnostics }
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
  for (const target of targets) {
    const path = `${target.contractName}.${target.procedure}.${target.protocol}`
    for (const dependency of getExplicitInjections(
      target.binding.implementation,
    ).values()) {
      register(dependency, path)
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
    for (const item of target.pipeline) {
      if (item.kind !== 'layer') continue
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
    }
  }
  return keys
}

export function assertValidCompilation(result: CompilationResult): ApplicationGraphIR {
  if (result.diagnostics.length > 0) {
    throw new StaticValidationError(result.diagnostics)
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
  providers: ReadonlyMap<TokenLike, ProviderDescriptor>,
  diagnostics: Diagnostic[],
) {
  const path = `${target.contractName}.${target.procedure}.${target.protocol}`
  const terminals = target.pipeline
    .map((layer, index) => ({ layer, index }))
    .filter(({ layer }) => layer.kind === 'terminal')

  if (terminals.length !== 1) {
    diagnostics.push({
      code: 'LUTRE_PIPELINE_001',
      message: `Pipeline must contain exactly one ${target.protocol} terminal`,
      path,
    })
  } else {
    const terminal = terminals[0]!
    if (terminal.index !== target.pipeline.length - 1) {
      diagnostics.push({
        code: 'LUTRE_PIPELINE_002',
        message: `${terminal.layer.name} must be the final Pipeline item`,
        path,
      })
    }
    if (
      terminal.layer.kind === 'terminal' &&
      terminal.layer.protocol !== target.protocol
    ) {
      diagnostics.push({
        code: 'LUTRE_PIPELINE_003',
        message: `${terminal.layer.name} does not match protocol ${target.protocol}`,
        path,
      })
    }
  }

  const available = new Set<ContextKey>()
  const validated = new Set<string>()
  for (const item of target.pipeline) {
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
  }

  for (const dependency of getExplicitInjections(target.binding.implementation).values()) {
    const provider = providers.get(dependency)
    if (!provider) {
      diagnostics.push({
        code: 'LUTRE_DI_001',
        message: `${target.binding.implementation.name}のconstructor依存${tokenName(dependency)}を提供するProviderがありません。execution dataはContextOfから取得してください`,
        path,
      })
    }
  }
}

function toLayerIR(item: PipelineItem, index: number): LayerIR {
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
  }
}
