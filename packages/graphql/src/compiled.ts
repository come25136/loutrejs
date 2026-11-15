import { type HttpRawExecutionContext } from '@loutrejs/loutre/http'
import { type GraphQLSessionContext } from './types.js'
import {
  type ExecutionDefinition,
  type ExecutionHandlerResolver,
  type ExecutionExtensionRuntime,
  type ExecutionNodeId,
} from '@loutrejs/loutre'

export interface GraphQLEndpointHandlers {
  http(context: HttpRawExecutionContext): Promise<Response>
  readonly websocket: {
    endpoint(context: GraphQLSessionContext): Promise<void>
  }
}

export interface EndpointDefinition extends ExecutionDefinition {
  readonly name: string
  readonly path: string
  readonly http: boolean
  readonly websocket: boolean
  readonly factory: () => GraphQLEndpointHandlers
}

export type CompiledEndpoint = Omit<
  EndpointDefinition,
  keyof ExecutionDefinition | 'factory'
> & {
  readonly handler: ExecutionHandlerResolver<GraphQLEndpointHandlers>
}

export interface EndpointExtensionRuntime extends ExecutionExtensionRuntime {
  endpoint(id: ExecutionNodeId): GraphQLEndpointHandlers
}
