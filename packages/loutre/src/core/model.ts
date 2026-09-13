import { diagnostic, isErrorDiagnostic, type Diagnostic } from './diagnostic.js'
import {
  isExecutionDefinition,
  type AnyExecutionExtension,
  type ExecutionContribution,
  type ExecutionDefinition,
  type ExecutionExtension,
} from './extension.js'
import type { ModuleInstance } from './module.js'
import { isFrameworkProvidedToken } from './token-internal.js'
import { tokenName } from './token.js'
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
import { getSourceLocation } from './source-location.js'
import { isTokenVisible, moduleDeclaresToken } from './model/visibility.js'

import type {
  ApplicationModel,
  ApplicationModelBuildOptions,
  ApplicationModelExtension,
  ApplicationModelExtensions,
  ExecutionModelNode,
} from './model/types.js'

export type {
  ApplicationModel,
  ApplicationModelBuildOptions,
  ApplicationModelEdge,
  ApplicationModelExtension,
  ApplicationModelExtensions,
  ApplicationModelNode,
  CompiledOf,
  ExecutionModelNode,
  FrameworkModelNode,
  LifecycleModelNode,
  ModuleModelNode,
  ProviderModelNode,
} from './model/types.js'

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
      const executionSource = getSourceLocation(value)
      const execution: ExecutionModelNode = Object.freeze({
        ...contribution,
        dependencies: Object.freeze([...contribution.dependencies]),
        capabilities: Object.freeze([...contribution.capabilities]),
        moduleId,
        ...(executionSource === undefined ? {} : { source: executionSource }),
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
