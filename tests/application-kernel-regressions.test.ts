import { describe, expect, it } from 'vitest'
import {
  bootstrapApplication,
  defineApplication,
  defineExecution,
  defineExecutionExtension,
  defineModule,
  type ExecutionDefinition,
} from '@loutrejs/loutre'

interface BrokenHostDefinition extends ExecutionDefinition {
  readonly id: string
}

describe('Application Kernel regression', () => {
  it('Host API生成失敗時にExtensionとProviderをrollbackする', async () => {
    const events: string[] = []
    const extension = defineExecutionExtension<
      BrokenHostDefinition,
      Record<never, never>,
      'broken',
      { readonly value: string }
    >({
      kind: 'execution-extension',
      name: '@fixture/broken-host',
      compile: (definition) => ({
        kind: 'execution',
        id: definition.id,
        executionKind: 'fixture.broken-host',
        extension: definition.extension,
        dependencies: [],
        capabilities: [],
        compiled: {},
      }),
      createRuntime: () => ({
        drain() {
          events.push('extension.drain')
        },
        close() {
          events.push('extension.close')
        },
      }),
      host: {
        namespace: 'broken',
        create() {
          throw new Error('host creation failed')
        },
      },
    })

    class Resource {
      onModuleDestroy() {
        events.push('provider.destroy')
      }
    }

    const execution = defineExecution(extension, { id: 'broken.host' })
    const Module = defineModule(() => ({
      providers: [Resource],
      executions: [execution],
    }))

    await expect(
      bootstrapApplication({
        application: defineApplication({ modules: [Module()] }),
      }),
    ).rejects.toThrow('host creation failed')

    expect(events).toEqual([
      'extension.drain',
      'extension.close',
      'provider.destroy',
    ])
  })
})
