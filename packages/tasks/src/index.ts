import {
  defineExecution,
  defineExecutionExtension,
  runInInjectionContext,
  type ExecutionDefinition,
  type ExecutionKernelRuntime,
  type TokenLike,
  type TokenValue,
} from '@loutrejs/loutre'

export type TaskRuntime<TInput, TOutput> = [TInput] extends [void]
  ? () => TOutput | Promise<TOutput>
  : (input: TInput) => TOutput | Promise<TOutput>

export interface TaskDefinitionData<
  TInput = unknown,
  TOutput = unknown,
  TInject extends readonly TokenLike[] = readonly TokenLike[],
> {
  readonly name: string
  readonly inject: TInject
  readonly factory: (
    ...dependencies: { [K in keyof TInject]: TokenValue<TInject[K]> }
  ) => TaskRuntime<TInput, TOutput>
  readonly '~input'?: TInput
  readonly '~output'?: TOutput
}

export type TaskInput<TTask> =
  TTask extends TaskDefinitionData<infer TInput, any, any> ? TInput : never

export type TaskOutput<TTask> =
  TTask extends TaskDefinitionData<any, infer TOutput, any> ? TOutput : never

export type TaskArguments<TTask> = [TaskInput<TTask>] extends [void]
  ? readonly []
  : readonly [input: TaskInput<TTask>]

interface CompiledTask {
  readonly definition: object
  readonly name: string
  readonly inject: readonly TokenLike[]
  readonly factory: (...dependencies: any[]) => (...arguments_: any[]) => any
}

export interface TasksExtensionRuntime {
  run<TTask extends TaskDefinitionData<any, any, any>>(
    task: TTask & ExecutionDefinition,
    ...arguments_: TaskArguments<TTask>
  ): Promise<TaskOutput<TTask>>
  drain(): void
}

export interface TasksHostApi {
  run<TTask extends TaskDefinitionData<any, any, any>>(
    task: TTask & ExecutionDefinition,
    ...arguments_: TaskArguments<TTask>
  ): Promise<TaskOutput<TTask>>
}

export const tasksExtension = defineExecutionExtension<
  TaskDefinitionData & ExecutionDefinition,
  CompiledTask,
  'tasks',
  TasksHostApi,
  TasksExtensionRuntime
>({
  kind: 'execution-extension',
  name: '@loutrejs/tasks',
  compile(definition) {
    return {
      kind: 'execution',
      id: `task.${definition.name}`,
      executionKind: 'task.invocation',
      extension: definition.extension,
      dependencies: definition.inject,
      capabilities: [],
      compiled: {
        definition,
        name: definition.name,
        inject: definition.inject,
        factory: definition.factory as CompiledTask['factory'],
      },
    }
  },
  validate({ executions }) {
    const names = new Set<string>()
    return executions.flatMap((execution) => {
      if (!names.has(execution.compiled.name)) {
        names.add(execution.compiled.name)
        return []
      }
      return [
        {
          code: 'LUTRE_TASK_DUPLICATE',
          message: `Task ${execution.compiled.name} is declared more than once.`,
          path: execution.id,
        },
      ]
    })
  },
  createRuntime({ executions, applicationRuntime }) {
    return createTasksRuntime(executions, applicationRuntime)
  },
  project: ({ execution }) => ({ name: execution.compiled.name }),
  host: {
    namespace: 'tasks',
    create: ({ runtime }) => ({
      run: (definition, ...arguments_) =>
        runtime.run(definition, ...arguments_),
    }),
  },
})

export type TaskDefinition<
  TInput = unknown,
  TOutput = unknown,
  TInject extends readonly TokenLike[] = readonly TokenLike[],
> = TaskDefinitionData<TInput, TOutput, TInject> &
  ExecutionDefinition<typeof tasksExtension>

export function task<
  TInput = void,
  TOutput = void,
  const TInject extends readonly TokenLike[] = readonly [],
>(definition: {
  readonly name: string
  readonly inject?: TInject
  readonly factory: TaskDefinitionData<TInput, TOutput, TInject>['factory']
}): TaskDefinition<TInput, TOutput, TInject> {
  return defineExecution(tasksExtension, {
    name: definition.name,
    inject: definition.inject ?? ([] as unknown as TInject),
    factory: definition.factory,
  }) as TaskDefinition<TInput, TOutput, TInject>
}

function createTasksRuntime(
  executions: readonly {
    readonly compiled: CompiledTask
  }[],
  applicationRuntime: ExecutionKernelRuntime,
): TasksExtensionRuntime {
  const runtimes = new Map<object, (...arguments_: any[]) => any>()
  for (const execution of executions) {
    const dependencies = execution.compiled.inject.map((token) =>
      applicationRuntime.resolve(token),
    )
    const runtime = runInInjectionContext(
      {
        consumer: {
          kind: 'task-consumer',
          id: `task:${execution.compiled.name}`,
          name: execution.compiled.name,
        },
        resolve: (token) => applicationRuntime.resolve(token),
      },
      () => execution.compiled.factory(...dependencies),
    )
    runtimes.set(execution.compiled.definition, runtime)
  }
  return {
    async run(definition, ...arguments_) {
      const runtime = runtimes.get(definition)
      if (!runtime) {
        throw new Error(`LUTRE_TASK_NOT_REGISTERED: ${definition.name}`)
      }
      const lease = applicationRuntime.beginExecution()
      try {
        return (await Reflect.apply(
          runtime,
          undefined,
          arguments_,
        )) as TaskOutput<typeof definition>
      } finally {
        lease.complete()
      }
    },
    drain() {},
  }
}
