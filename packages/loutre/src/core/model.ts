import { diagnostic, isErrorDiagnostic, type Diagnostic } from './diagnostic.js'
import type { ArgsClass } from './args.js'
import {
  isExecutionDefinition,
  type AnyExecutionExtension,
  type ExecutionContribution,
  type ExecutionDefinition,
  type ExecutionExtension,
  type RuntimeCapability,
} from './extension.js'
import type { ModuleInstance, ModuleTemplate } from './module.js'
import type { ProviderDescriptor } from './provider.js'
import type { LifecycleHook } from './lifecycle.js'
import { isFrameworkProvidedToken } from './token-internal.js'
import { tokenName, type TokenLike } from './token.js'
import { createModelBuildContext } from './model/context.js'
import { resolveLifecycleDependencies } from './model/lifecycle.js'
import { collectModuleDeclarations } from './model/modules.js'
import {
  compileArgumentsProvider,
  resolveModuleExports,
  resolveProviderDependencies,
} from './model/providers.js'
import { snapshotExecutionExtension } from './model/snapshot.js'
import { validateHostNamespaces, validateNodeIds } from './model/validation.js'
import { isTokenVisible, moduleDeclaresToken } from './model/visibility.js'

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
    | 'references'
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
  const errors = model.diagnostics.filter(isErrorDiagnostic)
  if (errors.length > 0) throw new ApplicationModelError(errors)
  return model
}

export function buildApplicationModel(
  options: ApplicationModelBuildOptions,
): ApplicationModel {
  const context = createModelBuildContext(options)
  collectModuleDeclarations(context)
  resolveModuleExports(context)
  compileArgumentsProvider(context)
  resolveProviderDependencies(context)
  resolveLifecycleDependencies(context)

  const {
    modules,
    moduleIds,
    nodes,
    edges,
    diagnostics,
    providers,
    executions,
    providerNodes,
  } = context

  const extensionExecutions = new Map<
    symbol,
    {
      readonly extension: ExecutionExtension
      readonly executions: ExecutionModelNode[]
    }
  >()
  const extensionNames = new Map<
    string,
    { readonly identity: symbol; readonly abiVersion: string }
  >()
  const extensionIdentities = new Map<
    symbol,
    { readonly name: string; readonly extension: ExecutionExtension }
  >()
  const executionIds = new Set<string>()
  const capabilityNodeIds = new Set<string>()
  const visitedDefinitions = new Set<ExecutionDefinition>()
  const compiledDefinitions = new Map<ExecutionDefinition, ExecutionModelNode>()
  const executionReferences: {
    readonly from: ExecutionDefinition
    readonly to: ExecutionDefinition
  }[] = []
  type ExecutionReferencesResult =
    | { readonly references: readonly unknown[] }
    | { readonly error: unknown }
  const executionReferenceResults = new Map<
    ExecutionDefinition,
    ExecutionReferencesResult
  >()
  const getExecutionReferences = (
    definition: ExecutionDefinition,
  ): ExecutionReferencesResult => {
    const cached = executionReferenceResults.get(definition)
    if (cached) return cached
    const references = definition.extension.references
    if (!references) {
      const result = { references: Object.freeze([]) }
      executionReferenceResults.set(definition, result)
      return result
    }
    try {
      const result = {
        references: references(definition as never) as readonly unknown[],
      }
      executionReferenceResults.set(definition, result)
      return result
    } catch (error) {
      const result = { error }
      executionReferenceResults.set(definition, result)
      return result
    }
  }

  const rootDefinitionOwners = new Map<
    ExecutionDefinition,
    Set<ModuleInstance>
  >()
  for (const module of modules) {
    for (const value of module.definition.executions ?? []) {
      if (!isExecutionDefinition(value)) continue
      const owners =
        rootDefinitionOwners.get(value) ?? new Set<ModuleInstance>()
      owners.add(module)
      rootDefinitionOwners.set(value, owners)
    }
  }

  const reachableDefinitionModules = new Map<
    ExecutionDefinition,
    Set<ModuleInstance>
  >()
  for (const module of modules) {
    const queue = (module.definition.executions ?? []).filter(
      isExecutionDefinition,
    )
    const seen = new Set<ExecutionDefinition>()
    let queueIndex = 0
    while (queueIndex < queue.length) {
      const value = queue[queueIndex++]!
      if (seen.has(value)) continue
      seen.add(value)

      const explicitOwners = rootDefinitionOwners.get(value)
      if (explicitOwners && !explicitOwners.has(module)) continue

      const reachableModules =
        reachableDefinitionModules.get(value) ?? new Set<ModuleInstance>()
      reachableModules.add(module)
      reachableDefinitionModules.set(value, reachableModules)

      const referenceResult = getExecutionReferences(value)
      if ('error' in referenceResult) continue
      for (const reference of referenceResult.references) {
        if (!isExecutionDefinition(reference)) continue
        if (reference.extension.identity !== value.extension.identity) continue
        queue.push(reference)
      }
    }
  }

  const definitionOwners = new Map<ExecutionDefinition, ModuleInstance>()
  const ambiguousDefinitions = new Set<ExecutionDefinition>()
  for (const [definition, explicitOwners] of rootDefinitionOwners) {
    if (explicitOwners.size === 1) {
      definitionOwners.set(definition, [...explicitOwners][0]!)
    } else {
      ambiguousDefinitions.add(definition)
    }
  }
  for (const [definition, reachableModules] of reachableDefinitionModules) {
    if (rootDefinitionOwners.has(definition)) continue
    if (reachableModules.size === 1) {
      definitionOwners.set(definition, [...reachableModules][0]!)
    } else {
      ambiguousDefinitions.add(definition)
    }
  }
  if (ambiguousDefinitions.size > 0) {
    diagnostics.push(
      diagnostic(
        'LUTRE_EXECUTION_OWNER_AMBIGUOUS',
        'Execution Definition ownership is ambiguous across multiple Modules. Register each shared Definition in exactly one Module.executions; other Modules may reference it.',
        'application.executions',
      ),
    )
  }

  for (const module of modules) {
    const moduleId = moduleIds.get(module)!
    const rootDefinitions = module.definition.executions ?? []
    const rootDefinitionIndexes = new Map<ExecutionDefinition, number>()
    for (const [definitionIndex, value] of rootDefinitions.entries()) {
      if (isExecutionDefinition(value) && !rootDefinitionIndexes.has(value)) {
        rootDefinitionIndexes.set(value, definitionIndex)
      }
    }

    const discoveredDefinitionIndexes = new Map<ExecutionDefinition, number>()
    const queue: {
      readonly value: unknown
      readonly definitionIndex: number
      readonly path: string
    }[] = rootDefinitions.map((value, definitionIndex) => ({
      value,
      definitionIndex,
      path: `${moduleId}.executions.${definitionIndex}`,
    }))
    let nextDiscoveredDefinitionIndex = rootDefinitions.length
    let queueIndex = 0

    while (queueIndex < queue.length) {
      const { value, definitionIndex, path } = queue[queueIndex++]!
      if (!isExecutionDefinition(value)) {
        diagnostics.push(
          diagnostic(
            'LUTRE_EXECUTION_DEFINITION_INVALID',
            'Module executions and referenced executions accept only branded Execution Definitions.',
            path,
          ),
        )
        continue
      }
      if (ambiguousDefinitions.has(value)) continue
      if (definitionOwners.get(value) !== module) continue
      if (visitedDefinitions.has(value)) continue
      visitedDefinitions.add(value)

      const extension = value.extension
      const namedIdentity = extensionNames.get(extension.name)
      if (namedIdentity && namedIdentity.identity !== extension.identity) {
        diagnostics.push(
          diagnostic(
            'LUTRE_EXTENSION_ABI_MISMATCH',
            `Extension ${extension.name} mixes incompatible ABI versions ${namedIdentity.abiVersion} and ${extension.abiVersion}.`,
            path,
          ),
        )
        continue
      }
      const identityOwner = extensionIdentities.get(extension.identity)
      if (identityOwner && identityOwner.name !== extension.name) {
        diagnostics.push(
          diagnostic(
            'LUTRE_EXTENSION_IDENTITY_COLLISION',
            `Extension identity is shared by ${identityOwner.name} and ${extension.name}.`,
            path,
          ),
        )
        continue
      }
      const canonicalExtension =
        identityOwner?.extension ?? snapshotExecutionExtension(extension)
      extensionNames.set(extension.name, {
        identity: extension.identity,
        abiVersion: extension.abiVersion,
      })
      extensionIdentities.set(extension.identity, {
        name: extension.name,
        extension: canonicalExtension,
      })

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
        dependencies: Object.freeze([...contribution.dependencies]),
        capabilities: Object.freeze([...contribution.capabilities]),
        moduleId,
      })
      compiledDefinitions.set(value, execution)
      executions.push(execution)
      nodes.push(execution)
      edges.push({ from: moduleId, to: execution.id, kind: 'owns' })
      const grouped = extensionExecutions.get(extension.identity) ?? {
        extension: canonicalExtension,
        executions: [] as ExecutionModelNode[],
      }
      grouped.executions.push(execution)
      extensionExecutions.set(extension.identity, grouped)
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
        if (!capabilityNodeIds.has(capabilityId)) {
          capabilityNodeIds.add(capabilityId)
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

      const referenceResult = getExecutionReferences(value)
      if ('error' in referenceResult) {
        diagnostics.push(
          diagnostic(
            'LUTRE_EXTENSION_REFERENCES',
            describeError(referenceResult.error),
            path,
          ),
        )
        continue
      }
      for (const [
        referenceIndex,
        reference,
      ] of referenceResult.references.entries()) {
        const referencePath = `${path}.references.${referenceIndex}`
        if (!isExecutionDefinition(reference)) {
          diagnostics.push(
            diagnostic(
              'LUTRE_EXECUTION_REFERENCE_INVALID',
              'Execution references accept only branded Execution Definitions.',
              referencePath,
            ),
          )
          continue
        }
        if (reference.extension.identity !== extension.identity) {
          diagnostics.push(
            diagnostic(
              'LUTRE_EXECUTION_REFERENCE_EXTENSION',
              `Execution ${execution.id} cannot reference an execution owned by ${reference.extension.name}.`,
              referencePath,
            ),
          )
          continue
        }
        executionReferences.push({ from: value, to: reference })
        let referencedDefinitionIndex = rootDefinitionIndexes.get(reference)
        if (referencedDefinitionIndex === undefined) {
          referencedDefinitionIndex = discoveredDefinitionIndexes.get(reference)
          if (referencedDefinitionIndex === undefined) {
            referencedDefinitionIndex = nextDiscoveredDefinitionIndex++
            discoveredDefinitionIndexes.set(
              reference,
              referencedDefinitionIndex,
            )
          }
        }
        queue.push({
          value: reference,
          definitionIndex: referencedDefinitionIndex,
          path: referencePath,
        })
      }
    }
  }

  for (const reference of executionReferences) {
    const from = compiledDefinitions.get(reference.from)
    const to = compiledDefinitions.get(reference.to)
    if (!from || !to) continue
    edges.push({ from: from.id, to: to.id, kind: 'references' })
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
  validateNodeIds(nodes, diagnostics)

  return Object.freeze({
    kind: 'application-model' as const,
    ...(options.arguments === undefined
      ? {}
      : { arguments: options.arguments }),
    providers: Object.freeze(providers),
    nodes: Object.freeze(nodes.map((node) => Object.freeze(node))),
    edges: Object.freeze(edges.map((edge) => Object.freeze(edge))),
    executions: Object.freeze(executions),
    extensions,
    diagnostics: Object.freeze(
      diagnostics.map((item) => Object.freeze({ ...item })),
    ),
  })
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
