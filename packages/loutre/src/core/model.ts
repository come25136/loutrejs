import { diagnostic, type Diagnostic } from './diagnostic.js'
import type { ArgsClass } from './args.js'
import {
  isExecutionDefinition,
  type AnyExecutionExtension,
  type ExecutionContribution,
  type ExecutionExtension,
  type RuntimeCapability,
} from './extension.js'
import {
  asModuleInstance,
  type ModuleInstance,
  type ModuleTemplate,
} from './module.js'
import {
  argumentsProvider,
  normalizeProvider,
  type ProviderDescriptor,
} from './provider.js'
import { collectInjectedDependencies } from './injection.js'
import type { LifecycleHook } from './lifecycle.js'
import { isFrameworkProvidedToken } from './token-internal.js'
import { tokenName, type TokenLike } from './token.js'

export interface ModuleModelNode {
  readonly kind: 'module'
  readonly id: string
  readonly name?: string
  readonly description?: string
}

export interface ProviderModelNode {
  readonly kind: 'provider'
  readonly id: string
  readonly token: TokenLike
  readonly provider: ProviderDescriptor
  readonly moduleId: string
  readonly dependencies: readonly TokenLike[]
}

export interface ExecutionModelNode<TCompiled = unknown> {
  readonly kind: 'execution'
  readonly id: string
  readonly executionKind: string
  readonly moduleId: string
  readonly dependencies: readonly TokenLike[]
  readonly capabilities: readonly RuntimeCapability[]
  readonly compiled: TCompiled
}

export interface LifecycleModelNode {
  readonly kind: 'lifecycle'
  readonly id: string
  readonly moduleId: string
  readonly phase: string
  readonly hook: LifecycleHook<any>
}

export interface FrameworkModelNode {
  readonly kind: 'framework'
  readonly id: string
  readonly frameworkKind: 'runtime-capability' | 'execution-extension'
  readonly name: string
}

export type ApplicationModelNode =
  | ModuleModelNode
  | ProviderModelNode
  | ExecutionModelNode
  | LifecycleModelNode
  | FrameworkModelNode

export interface ApplicationModelEdge {
  readonly from: string
  readonly to: string
  readonly kind:
    | 'owns'
    | 'imports'
    | 'exports'
    | 'injects'
    | 'requires'
    | 'starts'
    | 'wraps'
}

export type CompiledOf<TExtension extends AnyExecutionExtension> =
  TExtension extends ExecutionExtension<any, infer TCompiled, any, any, any>
    ? TCompiled
    : never

export interface ApplicationModelExtension<
  TExtension extends AnyExecutionExtension = AnyExecutionExtension,
> {
  readonly extension: TExtension
  readonly executions: readonly ExecutionModelNode<CompiledOf<TExtension>>[]
}

export interface ApplicationModelExtensions extends Iterable<ApplicationModelExtension> {
  get<TExtension extends AnyExecutionExtension>(
    extension: TExtension,
  ): ApplicationModelExtension<TExtension> | undefined
  values(): readonly ApplicationModelExtension[]
}

class ApplicationModelExtensionRegistry implements ApplicationModelExtensions {
  readonly #ordered: readonly ApplicationModelExtension[]
  readonly #groups: ReadonlyMap<symbol, ApplicationModelExtension>

  constructor(groups: readonly ApplicationModelExtension[]) {
    this.#ordered = Object.freeze([...groups])
    this.#groups = new Map(
      groups.map((group) => [group.extension.identity, group]),
    )
  }

  get<TExtension extends AnyExecutionExtension>(
    extension: TExtension,
  ): ApplicationModelExtension<TExtension> | undefined {
    return this.#groups.get(extension.identity) as
      | ApplicationModelExtension<TExtension>
      | undefined
  }

  values(): readonly ApplicationModelExtension[] {
    return this.#ordered
  }

  [Symbol.iterator](): Iterator<ApplicationModelExtension> {
    return this.#ordered[Symbol.iterator]()
  }
}

export interface ApplicationModel {
  readonly kind: 'application-model'
  readonly modules: readonly ModuleInstance[]
  readonly arguments?: ArgsClass
  readonly providers: readonly ProviderDescriptor[]
  readonly nodes: readonly ApplicationModelNode[]
  readonly edges: readonly ApplicationModelEdge[]
  readonly executions: readonly ExecutionModelNode[]
  readonly extensions: ApplicationModelExtensions
  readonly diagnostics: readonly Diagnostic[]
}

export interface ApplicationModelBuildOptions {
  readonly modules: readonly (ModuleInstance | ModuleTemplate<void>)[]
  readonly arguments?: ArgsClass
}

export class ApplicationModelError extends Error {
  readonly code = 'LUTRE_APPLICATION_MODEL_INVALID'

  constructor(readonly diagnostics: readonly Diagnostic[]) {
    super(
      `Application Model is invalid:\n${diagnostics
        .map((item) => `${item.code} at ${item.path}: ${item.message}`)
        .join('\n')}`,
    )
    this.name = 'ApplicationModelError'
  }
}

export function assertValidApplicationModel(
  model: ApplicationModel,
): ApplicationModel {
  const errors = model.diagnostics.filter(
    (item) => (item.severity ?? 'error') === 'error',
  )
  if (errors.length > 0) throw new ApplicationModelError(errors)
  return model
}

export function buildApplicationModel(
  options: ApplicationModelBuildOptions,
): ApplicationModel {
  const modules = collectModules(options.modules)
  const moduleIds = new Map(
    modules.map((module, index) => [module, `module:${index + 1}`]),
  )
  const nodes: ApplicationModelNode[] = []
  const edges: ApplicationModelEdge[] = []
  const diagnostics: Diagnostic[] = []
  const providers: ProviderDescriptor[] = []
  const executions: ExecutionModelNode[] = []
  const providerNodes = new Map<TokenLike, ProviderModelNode>()
  const moduleNames = new Set<string>()

  for (const module of modules) {
    const moduleId = moduleIds.get(module)!
    if (module.definition.name) {
      if (moduleNames.has(module.definition.name)) {
        diagnostics.push(
          diagnostic(
            'LUTRE_MODULE_NAME_COLLISION',
            `Module name ${module.definition.name} is already registered.`,
            moduleId,
          ),
        )
      }
      moduleNames.add(module.definition.name)
    }
    nodes.push({
      kind: 'module',
      id: moduleId,
      ...(module.definition.name === undefined
        ? {}
        : { name: module.definition.name }),
      ...(module.definition.description === undefined
        ? {}
        : { description: module.definition.description }),
    })
    for (const imported of module.definition.imports ?? []) {
      const target = moduleIds.get(asModuleInstance(imported))
      if (target) edges.push({ from: moduleId, to: target, kind: 'imports' })
    }
    for (const declaration of module.definition.providers ?? []) {
      const provider = normalizeProvider(declaration)
      const providerId = `provider:${moduleId}:${tokenName(provider.provide)}`
      const existingProvider = providerNodes.get(provider.provide)
      if (
        existingProvider?.provider.kind === 'environment' &&
        provider.kind === 'environment'
      ) {
        edges.push({ from: moduleId, to: existingProvider.id, kind: 'owns' })
        continue
      }
      if (existingProvider) {
        diagnostics.push(
          diagnostic(
            'LUTRE_PROVIDER_DUPLICATE',
            `Provider ${tokenName(provider.provide)} is declared more than once.`,
            providerId,
          ),
        )
        continue
      }
      const node: ProviderModelNode = {
        kind: 'provider',
        id: providerId,
        token: provider.provide,
        provider,
        moduleId,
        dependencies: collectProviderDependencies(provider),
      }
      providers.push(provider)
      providerNodes.set(provider.provide, node)
      nodes.push(node)
      edges.push({ from: moduleId, to: providerId, kind: 'owns' })
      if (module.definition.exports?.includes(provider.provide)) {
        edges.push({ from: moduleId, to: providerId, kind: 'exports' })
      }
    }
    appendLifecycleNodes(module, moduleId, nodes, edges)
  }

  if (options.arguments) {
    const provider = argumentsProvider(options.arguments)
    const node: ProviderModelNode = {
      kind: 'provider',
      id: `provider:application:${options.arguments.name}`,
      token: options.arguments,
      provider,
      moduleId: 'application',
      dependencies: Object.freeze([]),
    }
    providers.push(provider)
    providerNodes.set(options.arguments, node)
    nodes.push(node)
  }

  for (const provider of providerNodes.values()) {
    if (provider.moduleId === 'application') continue
    const sourceModule = modules.find(
      (candidate) => moduleIds.get(candidate) === provider.moduleId,
    )
    if (!sourceModule) continue
    for (const dependency of provider.dependencies) {
      const target = providerNodes.get(dependency)
      if (target) {
        edges.push({ from: provider.id, to: target.id, kind: 'injects' })
        const targetModule = modules.find(
          (candidate) => moduleIds.get(candidate) === target.moduleId,
        )
        if (
          targetModule &&
          target.moduleId !== provider.moduleId &&
          !moduleDeclaresToken(sourceModule, dependency) &&
          !isTokenVisible(sourceModule, targetModule, dependency)
        ) {
          diagnostics.push(
            diagnostic(
              'LUTRE_MODULE_VISIBILITY',
              `Provider ${tokenName(provider.token)} depends on private ${tokenName(dependency)} from another Module.`,
              provider.id,
            ),
          )
        }
      } else if (!isFrameworkProvidedToken(dependency)) {
        diagnostics.push(
          diagnostic(
            'LUTRE_PROVIDER_DEPENDENCY_MISSING',
            `Provider ${tokenName(provider.token)} requires ${tokenName(dependency)}, but no provider is declared.`,
            provider.id,
          ),
        )
      }
    }
  }

  for (const lifecycle of nodes.filter(
    (node): node is LifecycleModelNode => node.kind === 'lifecycle',
  )) {
    for (const dependency of lifecycle.hook.inject) {
      const provider = providerNodes.get(dependency)
      if (provider) {
        edges.push({ from: lifecycle.id, to: provider.id, kind: 'injects' })
        const sourceModule = modules.find(
          (candidate) => moduleIds.get(candidate) === lifecycle.moduleId,
        )
        const providerModule = modules.find(
          (candidate) => moduleIds.get(candidate) === provider.moduleId,
        )
        if (
          sourceModule &&
          providerModule &&
          provider.moduleId !== lifecycle.moduleId &&
          !moduleDeclaresToken(sourceModule, dependency) &&
          !isTokenVisible(sourceModule, providerModule, dependency)
        ) {
          diagnostics.push(
            diagnostic(
              'LUTRE_MODULE_VISIBILITY',
              `Lifecycle ${lifecycle.phase} depends on private ${tokenName(dependency)} from another Module.`,
              lifecycle.id,
            ),
          )
        }
      } else if (!isFrameworkProvidedToken(dependency)) {
        diagnostics.push(
          diagnostic(
            'LUTRE_LIFECYCLE_DEPENDENCY_MISSING',
            `Lifecycle ${lifecycle.phase} requires ${tokenName(dependency)}, but no provider is declared.`,
            lifecycle.id,
          ),
        )
      }
    }
  }

  const extensionExecutions = new Map<
    ExecutionExtension,
    {
      readonly extension: ExecutionExtension
      readonly executions: ExecutionModelNode[]
    }
  >()
  const extensionNames = new Map<string, ExecutionExtension>()
  const executionIds = new Set<string>()

  for (const module of modules) {
    const moduleId = moduleIds.get(module)!
    for (const [definitionIndex, value] of (
      module.definition.executions ?? []
    ).entries()) {
      const path = `${moduleId}.executions.${definitionIndex}`
      if (!isExecutionDefinition(value)) {
        diagnostics.push(
          diagnostic(
            'LUTRE_EXECUTION_DEFINITION_INVALID',
            'Module executions accepts only branded Execution Definitions.',
            path,
          ),
        )
        continue
      }
      const extension = value.extension
      const sameName = extensionNames.get(extension.name)
      if (sameName && sameName !== extension) {
        diagnostics.push(
          diagnostic(
            'LUTRE_EXTENSION_NAME_COLLISION',
            `Different Extension descriptors use the same name ${extension.name}.`,
            path,
          ),
        )
        continue
      }
      extensionNames.set(extension.name, extension)

      let contribution: ExecutionContribution
      try {
        contribution = extension.compile(value as never, {
          moduleId,
          definitionIndex,
        })
      } catch (error) {
        diagnostics.push(
          diagnostic('LUTRE_EXTENSION_COMPILE', describeError(error), path),
        )
        continue
      }
      if (executionIds.has(contribution.id)) {
        diagnostics.push(
          diagnostic(
            'LUTRE_EXECUTION_ID_COLLISION',
            `Execution id ${contribution.id} is already registered.`,
            path,
          ),
        )
        continue
      }
      executionIds.add(contribution.id)
      const execution: ExecutionModelNode = Object.freeze({
        ...contribution,
        moduleId,
      })
      executions.push(execution)
      nodes.push(execution)
      edges.push({ from: moduleId, to: execution.id, kind: 'owns' })
      const grouped = extensionExecutions.get(extension) ?? {
        extension,
        executions: [] as ExecutionModelNode[],
      }
      grouped.executions.push(execution)
      extensionExecutions.set(extension, grouped)
      for (const dependency of execution.dependencies) {
        const provider = providerNodes.get(dependency)
        if (provider) {
          edges.push({ from: execution.id, to: provider.id, kind: 'injects' })
          const providerModule = modules.find(
            (candidate) => moduleIds.get(candidate) === provider.moduleId,
          )
          if (
            providerModule &&
            provider.moduleId !== moduleId &&
            !moduleDeclaresToken(module, dependency) &&
            !isTokenVisible(module, providerModule, dependency)
          ) {
            diagnostics.push(
              diagnostic(
                'LUTRE_MODULE_VISIBILITY',
                `Execution ${execution.id} depends on private ${tokenName(dependency)} from another Module.`,
                execution.id,
              ),
            )
          }
        } else if (!isFrameworkProvidedToken(dependency)) {
          diagnostics.push(
            diagnostic(
              'LUTRE_EXECUTION_DEPENDENCY_MISSING',
              `Execution ${execution.id} requires ${tokenName(dependency)}, but no provider is declared.`,
              execution.id,
            ),
          )
        }
      }
      for (const capability of execution.capabilities) {
        const capabilityId = `capability:${capability.id}`
        if (!nodes.some((node) => node.id === capabilityId)) {
          nodes.push({
            kind: 'framework',
            id: capabilityId,
            frameworkKind: 'runtime-capability',
            name: capability.id,
          })
        }
        edges.push({
          from: execution.id,
          to: capabilityId,
          kind: 'requires',
        })
      }
    }
  }

  const extensionGroups = [...extensionExecutions.values()].map(
    ({ extension, executions: ownedExecutions }): ApplicationModelExtension => {
      const extensionId = `extension:${extension.name}`
      nodes.push({
        kind: 'framework',
        id: extensionId,
        frameworkKind: 'execution-extension',
        name: extension.name,
      })
      for (const execution of ownedExecutions) {
        edges.push({ from: extensionId, to: execution.id, kind: 'starts' })
      }
      if (extension.validate) {
        try {
          diagnostics.push(
            ...extension.validate({ executions: ownedExecutions }),
          )
        } catch (error) {
          diagnostics.push(
            diagnostic(
              'LUTRE_EXTENSION_VALIDATE',
              describeError(error),
              extensionId,
            ),
          )
        }
      }
      return Object.freeze({
        extension,
        executions: Object.freeze([...ownedExecutions]),
      })
    },
  )

  const extensions = new ApplicationModelExtensionRegistry(extensionGroups)

  validateHostNamespaces(extensionGroups, diagnostics)

  return Object.freeze({
    kind: 'application-model' as const,
    modules: Object.freeze([...modules]),
    ...(options.arguments === undefined
      ? {}
      : { arguments: options.arguments }),
    providers: Object.freeze(providers),
    nodes: Object.freeze(nodes),
    edges: Object.freeze(edges),
    executions: Object.freeze(executions),
    extensions,
    diagnostics: Object.freeze(diagnostics),
  })
}

function collectProviderDependencies(
  provider: ProviderDescriptor,
): readonly TokenLike[] {
  switch (provider.kind) {
    case 'class':
      return collectInjectedDependencies(provider.provide, () =>
        Reflect.construct(provider.useClass, []),
      )
    case 'factory':
      return Object.freeze([...provider.inject])
    case 'conditional': {
      const dependencies = new Set<TokenLike>()
      for (const implementation of Object.values(provider.mapping)) {
        for (const dependency of collectInjectedDependencies(
          provider.provide,
          () => Reflect.construct(implementation, []),
        )) {
          dependencies.add(dependency)
        }
      }
      return Object.freeze([...dependencies])
    }
    case 'value':
    case 'environment':
    case 'arguments':
      return Object.freeze([])
  }
}

function collectModules(
  roots: readonly (ModuleInstance | ModuleTemplate<void>)[],
): ModuleInstance[] {
  const result: ModuleInstance[] = []
  const seen = new Set<ModuleInstance>()
  const visit = (candidate: ModuleInstance | ModuleTemplate<void>) => {
    const module = asModuleInstance(candidate)
    if (seen.has(module)) return
    seen.add(module)
    for (const imported of module.definition.imports ?? []) visit(imported)
    result.push(module)
  }
  for (const root of roots) visit(root)
  return result
}

function appendLifecycleNodes(
  module: ModuleInstance,
  moduleId: string,
  nodes: ApplicationModelNode[],
  edges: ApplicationModelEdge[],
): void {
  const lifecycle = module.definition.lifecycle
  if (!lifecycle) return
  for (const [phase, hook] of Object.entries(lifecycle)) {
    const id = `lifecycle:${moduleId}:${phase}`
    nodes.push({ kind: 'lifecycle', id, moduleId, phase, hook })
    edges.push({ from: moduleId, to: id, kind: 'owns' })
  }
}

function validateHostNamespaces(
  extensions: readonly ApplicationModelExtension[],
  diagnostics: Diagnostic[],
): void {
  const owners = new Map<string, ExecutionExtension>()
  for (const { extension } of extensions) {
    const namespace = extension.host?.namespace
    if (!namespace) continue
    const owner = owners.get(namespace)
    if (owner && owner !== extension) {
      diagnostics.push(
        diagnostic(
          'LUTRE_HOST_NAMESPACE_COLLISION',
          `Host namespace ${namespace} is contributed by both ${owner.name} and ${extension.name}.`,
          `host.${namespace}`,
        ),
      )
      continue
    }
    owners.set(namespace, extension)
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function moduleDeclaresToken(
  module: ModuleInstance,
  token: TokenLike,
): boolean {
  return (module.definition.providers ?? []).some(
    (provider) => normalizeProvider(provider).provide === token,
  )
}

function isTokenVisible(
  source: ModuleInstance,
  target: ModuleInstance,
  token: TokenLike,
  visited = new Set<ModuleInstance>(),
): boolean {
  if (visited.has(source)) return false
  visited.add(source)
  for (const importedValue of source.definition.imports ?? []) {
    const imported = asModuleInstance(importedValue)
    if (!imported.definition.exports?.includes(token)) continue
    if (imported === target) return true
    if (isTokenVisible(imported, target, token, new Set(visited))) return true
  }
  return false
}
