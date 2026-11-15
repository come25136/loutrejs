import {
  defineExecutionExtension,
  dependencyConsumerId,
  type ExecutionDefinition,
} from '@loutrejs/loutre'
import { createEndpointRuntime } from './runtime/endpoint.js'
import {
  type EndpointDefinition,
  type CompiledEndpoint,
  type EndpointExtensionRuntime,
} from './compiled.js'

export const graphqlExtension = defineExecutionExtension<
  EndpointDefinition,
  CompiledEndpoint,
  never,
  {},
  EndpointExtensionRuntime
>({
  kind: 'execution-extension',
  name: 'loutre:graphql',
  abiVersion: '2',
  compile(definition, context) {
    const id = `${definition.name}.graphql`
    const handler = context.compileHandler(
      { kind: 'factory', factory: definition.factory },
      {
        kind: 'execution',
        id: dependencyConsumerId(id),
        name: definition.name,
      },
    )
    return {
      kind: 'execution',
      id,
      executionKind: 'graphql.endpoint',
      capabilities: [],
      compiled: Object.freeze({
        name: definition.name,
        path: definition.path,
        http: definition.http,
        websocket: definition.websocket,
        handler,
      }),
    }
  },
  createRuntime: createEndpointRuntime,
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
