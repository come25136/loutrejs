import { describe, expect, it } from 'vitest'
import {
  bootstrapApplication,
  compileExecutionHandler,
  defineApplication,
  defineExecution,
  defineExecutionExtension,
  defineModule,
  delegateExecution,
  dependencyConsumerId,
  inject,
  type CompiledExecutionHandler,
  type ExecutionDefinition,
  type ExecutionExtensionRuntime,
  type ExecutionHandlerSource,
  type ExecutionNodeId,
} from '@loutrejs/loutre'

type Handler = () => number
interface Definition extends ExecutionDefinition {
  readonly name: string
  readonly handler: ExecutionHandlerSource<Handler>
}
interface Runtime extends ExecutionExtensionRuntime {
  handler(id: ExecutionNodeId): Handler
}
const extension = defineExecutionExtension<
  Definition,
  CompiledExecutionHandler<Handler>,
  'fixture',
  { invoke(id: ExecutionNodeId): number },
  Runtime
>({
  kind: 'execution-extension',
  name: 'fixture:handler',
  abiVersion: '1',
  compile(definition) {
    const compiled = compileExecutionHandler(definition.handler, {
      kind: 'execution',
      id: dependencyConsumerId(definition.name),
      name: definition.name,
    })
    return {
      kind: 'execution',
      id: definition.name,
      executionKind: 'fixture.handler',
      dependencies: compiled.dependencies,
      delegations: compiled.delegations,
      capabilities: [],
      compiled,
    }
  },
  createRuntime({ executions }) {
    const handlers = new Map(
      executions.map((binding) => [
        binding.execution.id,
        binding.execution.compiled.createResolver(binding),
      ]),
    )
    return {
      handler(id) {
        const resolve = handlers.get(id)
        if (!resolve) throw new Error('handlerが登録されていません。')
        return resolve()
      },
    }
  },
  host: {
    namespace: 'fixture',
    create: ({ runtime }) => ({ invoke: (id) => runtime.handler(id)() }),
  },
})

describe('Execution handlerの責務境界', () => {
  it.each([false, true])(
    '登録順が逆=%sでも委譲先のDIとApplicationごとの実体を使う',
    async (reverse) => {
      let instances = 0
      class Counter {
        readonly instance = ++instances
        value = 0
      }
      const target = defineExecution(extension, {
        name: 'target',
        handler: {
          kind: 'factory',
          factory:
            (counter = inject(Counter)) =>
            () =>
              counter.instance * 10 + ++counter.value,
        },
      })
      const source = defineExecution(extension, {
        name: 'source',
        handler: {
          kind: 'delegate',
          delegate: delegateExecution(target, (runtime, id) =>
            runtime.handler(id),
          ),
        },
      })
      const targetModule = defineModule({
        providers: [Counter],
        executions: [target],
      })
      const sourceModule = defineModule({ executions: [source] })
      const definition = defineApplication({
        modules: reverse
          ? [targetModule, sourceModule]
          : [sourceModule, targetModule],
      })
      expect(definition.model.diagnostics).toEqual([])
      expect(definition.model.edges).toContainEqual({
        kind: 'delegates',
        from: 'source',
        to: 'target',
      })
      expect(
        definition.model.executions.find(({ id }) => id === 'source')
          ?.dependencies,
      ).toEqual([])
      const sourceId = definition.model.executions.find(
        ({ id }) => id === 'source',
      )!.id
      const compiledInstances = instances
      await using first = await bootstrapApplication({
        application: definition,
      })
      await using second = await bootstrapApplication({
        application: definition,
      })
      expect(instances).toBe(compiledInstances + 2)
      expect(first.fixture.invoke(sourceId)).toBe(
        (compiledInstances + 1) * 10 + 1,
      )
      expect(first.fixture.invoke(sourceId)).toBe(
        (compiledInstances + 1) * 10 + 2,
      )
      expect(second.fixture.invoke(sourceId)).toBe(
        (compiledInstances + 2) * 10 + 1,
      )
    },
  )
})
