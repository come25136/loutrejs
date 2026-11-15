import {
  type MessagePortContract,
  type MessagePortResponseDefinition,
  type MessagePortServerStreamResponseDefinition,
} from './contract.js'
import { type CompiledMessagePortExecution } from './compiled.js'

export function snapshotMessagePortRoutes(
  routes: MessagePortContract['routes'],
): CompiledMessagePortExecution['routes'] {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(routes).map(([name, route]) => [
        name,
        Object.freeze({
          ...(route.input === undefined ? {} : { input: route.input }),
          responses: Object.freeze(
            Object.fromEntries(
              Object.entries(route.responses).map(([response, definition]) => [
                response,
                isMessagePortServerStreamResponse(definition)
                  ? Object.freeze({ kind: 'stream', schema: definition.body })
                  : Object.freeze({ kind: 'unary', schema: definition }),
              ]),
            ),
          ),
        }),
      ]),
    ),
  )
}

function isMessagePortServerStreamResponse(
  response: MessagePortResponseDefinition,
): response is MessagePortServerStreamResponseDefinition {
  return (
    typeof response === 'object' &&
    response !== null &&
    'stream' in response &&
    response.stream === 'server' &&
    'body' in response
  )
}
