import { describe, expect, it } from 'vitest'
import {
  bootstrapApplication,
  defineApplication,
  defineExecution,
  defineExecutionExtension,
  defineModule,
  delegateExecution,
  dependencyConsumerId,
  inject,
  type ExecutionDefinition,
  type ExecutionExtensionRuntime,
  type ExecutionHandlerResolver,
  type ExecutionHandlerSource,
  type TokenLike,
} from '@loutrejs/loutre'

type Handler = () => number
interface Definition extends ExecutionDefinition {
  readonly name: string
  readonly handler: ExecutionHandlerSource<Handler>
  readonly probe?: () => unknown
  readonly dependencies?: readonly TokenLike[]
}
interface Runtime extends ExecutionExtensionRuntime {
  handler(name: string): Handler
}

const extension = defineExecutionExtension<
  Definition,
  { readonly handler: ExecutionHandlerResolver<Handler> },
  'fixture',
  { invoke(name: string): number },
  Runtime
>({
  kind: 'execution-extension',
  name: 'fixture:compilation',
  abiVersion: '1',
  compile(definition, context) {
    const consumer = {
      kind: 'execution',
      id: dependencyConsumerId(definition.name),
      name: definition.name,
    }
    if (definition.probe)
      context.collectDependencies(consumer, definition.probe)
    return {
      kind: 'execution',
      id: definition.name,
      executionKind: 'fixture.invocation',
      dependencies: definition.dependencies ?? [],
      capabilities: [],
      compiled: {
        handler: context.compileHandler(definition.handler, consumer),
      },
    }
  },
  createRuntime({ executions }) {
    const handlers = new Map<string, () => Handler>(
      executions.map((binding) => [
        binding.execution.id,
        binding.execution.compiled.handler.createResolver(binding),
      ]),
    )
    return {
      handler(name) {
        const resolve = handlers.get(name)
        if (!resolve) throw new Error(`handlerがありません。 ${name}`)
        return resolve()
      },
    }
  },
  host: {
    namespace: 'fixture',
    create: ({ runtime }) => ({ invoke: (name) => runtime.handler(name)() }),
  },
})

describe('Executionのcompile context', () => {
  it.each([false, true])(
    '登録順が逆=%sでも依存と委譲をModelへ集約し、各ApplicationのDIで解決する',
    async (reverse) => {
      class Counter {
        value = 0
      }
      class Middleware {}
      class Explicit {}
      const target = defineExecution(extension, {
        name: 'target',
        handler: {
          kind: 'factory',
          factory:
            (counter = inject(Counter)) =>
            () =>
              ++counter.value,
        },
        probe: () => inject(Middleware),
        dependencies: [Explicit, Counter],
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
      const owner = defineModule({
        providers: [Counter, Middleware, Explicit],
        executions: [target],
      })
      const caller = defineModule({ executions: [source] })
      const definition = defineApplication({
        modules: reverse ? [owner, caller] : [caller, owner],
      })
      expect(definition.model.diagnostics).toEqual([])
      const targetNode = definition.model.executions.find(
        (node) => node.id === 'target',
      )!
      const sourceNode = definition.model.executions.find(
        (node) => node.id === 'source',
      )!
      expect(new Set(targetNode.dependencies)).toEqual(
        new Set([Counter, Middleware, Explicit]),
      )
      expect(targetNode.dependencies).toHaveLength(3)
      expect(sourceNode.dependencies).toEqual([])
      expect(definition.model.edges).toContainEqual({
        kind: 'delegates',
        from: 'source',
        to: 'target',
      })
      const compiled =
        definition.model.extensions.get(extension)!.executions[0]!.compiled
      expect(compiled.handler).not.toHaveProperty('dependencies')
      expect(compiled.handler).not.toHaveProperty('delegations')
      await using first = await bootstrapApplication({
        application: definition,
      })
      await using second = await bootstrapApplication({
        application: definition,
      })
      expect(first.fixture.invoke('source')).toBe(1)
      expect(first.fixture.invoke('target')).toBe(2)
      expect(second.fixture.invoke('source')).toBe(1)
    },
  )

  it('Model間でcompile contextの依存を共有しない', () => {
    class Missing {}
    const invalid = defineExecution(extension, {
      name: 'invalid',
      handler: {
        kind: 'factory',
        factory:
          (value = inject(Missing)) =>
          () =>
            Number(Boolean(value)),
      },
    })
    const invalidApplication = defineApplication({
      modules: [defineModule({ executions: [invalid] })],
    })
    expect(invalidApplication.model.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'LUTRE_EXECUTION_DEPENDENCY_MISSING' }),
    )
    const valid = defineExecution(extension, {
      name: 'valid',
      handler: { kind: 'factory', factory: () => () => 1 },
    })
    const definition = defineApplication({
      modules: [defineModule({ executions: [valid] })],
    })
    expect(definition.model.executions[0]!.dependencies).toEqual([])
  })
})
