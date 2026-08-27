import {
  asModuleInstance,
  normalizeProvider,
  queueRuntimeToken,
  type EntrypointDescriptor,
  type ModuleInstance,
  type ModuleTemplate,
  type QueueDescriptor,
  type StandardSchemaV1,
  type TriggerDescriptor,
} from '@loutrejs/core'
import {
  compileApplication as compileLegacyApplication,
  type ApplicationCompilationInput as LegacyApplicationCompilationInput,
} from './graph.js'
import type {
  ApplicationGraphIR as LegacyApplicationGraphIR,
  Diagnostic,
} from './ir.js'
import type {
  ApplicationGraphIR,
  CompilationResult,
  ExecutionRootIR,
  QueueIR,
} from './ir-v4.js'

export interface ApplicationCompilationInput {
  readonly modules: readonly (ModuleInstance | ModuleTemplate<void>)[]
  readonly entrypoint?: EntrypointDescriptor<any, any> | undefined
  readonly triggers?: readonly TriggerDescriptor[]
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

export function compileApplication(
  input: ApplicationCompilationInput,
): CompilationResult {
  const triggers = input.triggers ?? []
  const explicitEntrypoint = input.entrypoint
  const cronTriggers = triggers.filter(
    (
      trigger,
    ): trigger is Extract<TriggerDescriptor, { readonly trigger: 'cron' }> =>
      trigger.trigger === 'cron',
  )
  const queueTriggers = triggers.filter(
    (
      trigger,
    ): trigger is Extract<
      TriggerDescriptor,
      { readonly trigger: 'queue-consumer' }
    > => trigger.trigger === 'queue-consumer',
  )
  const fixedDelayTriggers = triggers.filter(
    (
      trigger,
    ): trigger is Extract<
      TriggerDescriptor,
      { readonly trigger: 'fixed-delay' }
    > => trigger.trigger === 'fixed-delay',
  )

  const schedules = cronTriggers.map((trigger) => ({
    kind: 'schedule' as const,
    name: trigger.name,
    cron: { expression: trigger.expression, timezone: trigger.timezone },
    entrypoint: trigger.entrypoint,
  })) satisfies NonNullable<LegacyApplicationCompilationInput['schedules']>
  const consumers = queueTriggers.map((trigger) => ({
    kind: 'queue-consumer' as const,
    name: trigger.name,
    queue: trigger.queue,
    entrypoint: trigger.entrypoint,
  })) satisfies NonNullable<LegacyApplicationCompilationInput['consumers']>
  const queues = uniqueQueues(queueTriggers.map((trigger) => trigger.queue))
  const bridgeEntrypoints = [
    ...new Set([
      ...(explicitEntrypoint ? [explicitEntrypoint] : []),
      ...fixedDelayTriggers.map((trigger) => trigger.entrypoint),
    ]),
  ]
  const legacyInput: LegacyApplicationCompilationInput = {
    modules: input.modules,
    entrypoints: bridgeEntrypoints,
    schedules,
    queues,
    consumers,
  }
  const legacy = compileLegacyApplication(legacyInput)
  const diagnostics = [
    ...legacy.diagnostics
      .filter(
        (diagnostic) =>
          diagnostic.code !== 'LUTRE_SCHEDULE_DUPLICATE' &&
          diagnostic.code !== 'LUTRE_CONSUMER_DUPLICATE',
      )
      .map(mapLegacyDiagnostic),
    ...validateTriggerNames(triggers),
    ...validateQueueDrivers(input.modules, queueTriggers),
  ]
  const graph = toGraphV4(
    legacy.graph,
    explicitEntrypoint,
    triggers,
    queues,
    diagnostics,
    input.modules,
  )
  return { graph, diagnostics }
}

export function assertValidCompilation(
  result: CompilationResult,
): ApplicationGraphIR {
  if (result.diagnostics.length > 0) {
    throw new StaticValidationError(result.diagnostics, result.graph)
  }
  return result.graph
}

function toGraphV4(
  legacy: LegacyApplicationGraphIR,
  explicitEntrypoint: EntrypointDescriptor<any, any> | undefined,
  triggers: readonly TriggerDescriptor[],
  queues: readonly QueueDescriptor[],
  diagnostics: readonly Diagnostic[],
  modules: readonly (ModuleInstance | ModuleTemplate<void>)[],
): ApplicationGraphIR {
  const explicitName = explicitEntrypoint?.name
  const executions: ExecutionRootIR[] = [
    ...legacy.executions.flatMap((execution): ExecutionRootIR[] => {
      if (execution.kind === 'protocol') return [execution]
      if (execution.kind === 'entrypoint' && execution.name === explicitName) {
        return [execution]
      }
      return []
    }),
    ...triggers.map(toTriggerExecution),
  ]
  return {
    version: 4,
    modules: legacy.modules,
    providers: legacy.providers,
    tokens: legacy.tokens,
    contextKeys: legacy.contextKeys,
    contracts: legacy.contracts,
    pipelines: legacy.pipelines,
    implementations: legacy.implementations,
    queues: queues.map(toQueueIR),
    executions,
    capabilities: legacy.capabilities,
    hostCapabilities: collectHostCapabilities(modules),
    nodes: legacy.nodes,
    edges: legacy.edges,
    diagnostics,
  }
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
        entrypoint: trigger.entrypoint.name,
      }
    case 'fixed-delay':
      return {
        id: `trigger:${trigger.name}`,
        kind: 'trigger',
        trigger: 'fixed-delay',
        name: trigger.name,
        delay: trigger.delay,
        immediate: trigger.immediate,
        entrypoint: trigger.entrypoint.name,
      }
    case 'queue-consumer':
      return {
        id: `trigger:${trigger.name}`,
        kind: 'trigger',
        trigger: 'queue-consumer',
        name: trigger.name,
        queue: trigger.queue.name,
        entrypoint: trigger.entrypoint.name,
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

function uniqueQueues(queues: readonly QueueDescriptor[]): QueueDescriptor[] {
  return [...new Set(queues)]
}

function validateTriggerNames(
  triggers: readonly TriggerDescriptor[],
): Diagnostic[] {
  const seen = new Set<string>()
  const diagnostics: Diagnostic[] = []
  for (const trigger of triggers) {
    if (seen.has(trigger.name)) {
      diagnostics.push({
        code: 'LUTRE_TRIGGER_DUPLICATE',
        message: `Duplicate trigger name: ${trigger.name}`,
        path: `trigger:${trigger.name}`,
      })
    }
    seen.add(trigger.name)
  }
  return diagnostics
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
    const token = queueRuntimeToken(trigger.queue)
    return providers.some((provider) => provider.provide === token)
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

function mapLegacyDiagnostic(diagnostic: Diagnostic): Diagnostic {
  switch (diagnostic.code) {
    case 'LUTRE_SCHEDULE_INVALID_CRON':
      return {
        ...diagnostic,
        code: 'LUTRE_TRIGGER_INVALID_CRON',
        path: `trigger:${diagnostic.path}`,
      }
    case 'LUTRE_SCHEDULE_INVALID_TIMEZONE':
      return {
        ...diagnostic,
        code: 'LUTRE_TRIGGER_INVALID_TIMEZONE',
        path: `trigger:${diagnostic.path}`,
      }
    default:
      return diagnostic
  }
}
