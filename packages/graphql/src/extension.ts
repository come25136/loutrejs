import {
  collectInjectedDependencies,
  defineExecutionExtension,
  dependencyConsumerId,
  runInInjectionContext,
  type ExecutionDefinition,
  type ExecutionExtensionRuntime,
  type ExecutionNodeId,
} from '@loutrejs/loutre'
import type { HttpRawExecutionContext } from '@loutrejs/loutre/http'
import type { GraphQLSessionContext } from './websocket.js'

export interface GraphQLEndpointHandlers {
  http(context: HttpRawExecutionContext): Promise<Response>
  readonly websocket: {
    endpoint(context: GraphQLSessionContext): Promise<void>
  }
}

interface EndpointDefinition extends ExecutionDefinition {
  readonly name: string
  readonly path: string
  readonly http: boolean
  readonly websocket: boolean
  readonly factory: () => GraphQLEndpointHandlers
}

type CompiledEndpoint = Omit<EndpointDefinition, keyof ExecutionDefinition>

interface EndpointExtensionRuntime extends ExecutionExtensionRuntime {
  endpoint(id: ExecutionNodeId): GraphQLEndpointHandlers
}

export const graphqlExtension = defineExecutionExtension<
  EndpointDefinition,
  CompiledEndpoint,
  never,
  {},
  EndpointExtensionRuntime
>({
  kind: 'execution-extension',
  name: 'loutre:graphql',
  abiVersion: '1',
  compile(definition) {
    const id = `${definition.name}.graphql`
    return {
      kind: 'execution',
      id,
      executionKind: 'graphql.endpoint',
      dependencies: collectInjectedDependencies(
        {
          kind: 'execution',
          id: dependencyConsumerId(id),
          name: definition.name,
        },
        definition.factory,
      ),
      capabilities: [],
      compiled: Object.freeze({
        name: definition.name,
        path: definition.path,
        http: definition.http,
        websocket: definition.websocket,
        factory: definition.factory,
      }),
    }
  },
  createRuntime({ executions }) {
    const endpoints = new Map(
      executions.map(({ execution, resolve }) => [
        execution.id,
        runInInjectionContext(
          {
            consumer: {
              kind: 'execution',
              id: dependencyConsumerId(execution.id),
              name: execution.compiled.name,
            },
            resolve: (token, consumer) => resolve(token, { consumer }),
          },
          execution.compiled.factory,
        ),
      ]),
    )
    return {
      endpoint(id) {
        const endpoint = endpoints.get(id)
        if (!endpoint)
          throw new Error(`GraphQL endpoint runtime is not available: ${id}`)
        return endpoint
      },
      close() {
        endpoints.clear()
      },
    }
  },
  projectGraph({ execution: { compiled } }) {
    return {
      name: compiled.name,
      path: compiled.path,
      transports: { http: compiled.http, websocket: compiled.websocket },
    }
  },
})

export type GraphQLEndpointDefinition = EndpointDefinition &
  ExecutionDefinition<typeof graphqlExtension>
