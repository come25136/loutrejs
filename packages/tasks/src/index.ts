import {
  collectInjectedDependencies,
  defineExecution,
  defineExecutionExtension,
  runInInjectionContext,
  type ExecutionDefinition,
  type ExecutionKernelRuntime,
} from '@loutrejs/loutre'

export type TaskRuntime<TInput, TOutput> = [TInput] extends [void]
  ? () => TOutput | Promise<TOutput>
  : (input: TInput) => TOutput | Promise<TOutput>

export interface TaskDefinitionData<TInput = unknown, TOutput = unknown> {
  readonly name: string
  readonly factory: () => TaskRuntime<TInput, TOutput>
  readonly '~input'?: TInput
  readonly '~output'?: TOutput
}

export type TaskInput<TTask> =
  TTask extends TaskDefinitionData<infer TInput, any> ? TInput : never

export type TaskOutput<TTask> =
  TTask extends TaskDefinitionData<any, infer TOutput> ? TOutput : never

export type TaskArguments<TTask> = [TaskInput<TTask>] extends [void]
  ? readonly []
  : readonly [input: TaskInput<TTask>]

interface CompiledTask {
  readonly definition: object
  readonly name: string
  readonly factory: () => (...arguments_: any[]) => any
}

export interface TasksExtensionRuntime {
  run<TTask extends TaskDefinitionData<any, any>>(
    task: TTask & ExecutionDefinition,
    ...arguments_: TaskArguments<TTask>
  ): Promise<TaskOutput<TTask>>
  drain(): void
}

export interface TasksHostApi {
  run<TTask extends TaskDefinitionData<any, any>>(
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
      dependencies: collectInjectedDependencies(
        {
          kind: 'task-consumer',
          id: `task:${definition.name}`,
          name: definition.name,
        },
        () => definition.factory(),
      ),
      capabilities: [],
      compiled: {
        definition,
        name: definition.name,
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
  projectGraph: ({ execution }) => ({ name: execution.compiled.name }),
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
> = TaskDefinitionData<TInput, TOutput> &
  ExecutionDefinition<typeof tasksExtension>

export function task<TInput = void, TOutput = void>(definition: {
  readonly name: string
  readonly factory: TaskDefinitionData<TInput, TOutput>['factory']
}): TaskDefinition<TInput, TOutput> {
  return defineExecution(tasksExtension, {
    name: definition.name,
    factory: definition.factory,
  }) as TaskDefinition<TInput, TOutput>
}

function createTasksRuntime(
  executions: readonly {
    readonly compiled: CompiledTask
  }[],
  applicationRuntime: ExecutionKernelRuntime,
): TasksExtensionRuntime {
  const runtimes = new Map<object, (...arguments_: any[]) => any>()
  for (const execution of executions) {
    const runtime = runInInjectionContext(
      {
        consumer: {
          kind: 'task-consumer',
          id: `task:${execution.compiled.name}`,
          name: execution.compiled.name,
        },
        resolve: (token) =>
          applicationRuntime.resolve(token, execution.compiled.name),
      },
      () => execution.compiled.factory(),
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
