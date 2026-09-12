import {
  defineApplication,
  defineExecution,
  defineExecutionExtension,
  defineModule,
  type ExecutionDefinition,
} from '@loutrejs/loutre'

interface WarningDefinition extends ExecutionDefinition {
  readonly id: string
}

const warningExtension = defineExecutionExtension<WarningDefinition, {}>({
  kind: 'execution-extension',
  abiVersion: '1',
  name: '@fixture/warning',
  compile: (definition) => ({
    kind: 'execution',
    id: definition.id,
    executionKind: 'fixture.warning',
    dependencies: [],
    capabilities: [],
    compiled: Object.freeze({}),
  }),
  validate: ({ executions }) =>
    executions.map((execution) => ({
      code: 'FIXTURE_WARNING',
      message: 'This diagnostic must not block CLI commands.',
      path: execution.id,
      severity: 'warning' as const,
    })),
  createRuntime: () => ({}),
})

const WarningModule = defineModule(() => ({
  executions: [defineExecution(warningExtension, { id: 'fixture.warning' })],
}))

export default defineApplication({ modules: [WarningModule()] })
