import {
  defineExecutionExtension,
  type ExecutionDefinition,
} from '../core/index.js'
import { dependencyConsumerId } from '../core/identity.js'
import { snapshotMessagePortRoutes } from './compiler.js'
import {
  type MessagePortProcedureName,
  messagePortProcedureName,
} from './identity.js'
import { createMessagePortRuntime } from './runtime/dispatch.js'
import {
  type MessagePortDefinition,
  type CompiledMessagePortExecution,
} from './compiled.js'
import {
  type MessagePortHostApi,
  type MessagePortExtensionRuntime,
} from './contract.js'

export const messagePortExtension = defineExecutionExtension<
  MessagePortDefinition & ExecutionDefinition,
  CompiledMessagePortExecution,
  'messagePort',
  MessagePortHostApi,
  MessagePortExtensionRuntime
>({
  kind: 'execution-extension',
  abiVersion: '2',
  name: 'loutre:message-port',
  compile(definition, context) {
    const id =
      definition.name ||
      `${context.moduleId}.message-port.${context.definitionIndex}`
    const handler = context.compileHandler(definition.handler, {
      kind: 'execution',
      id: dependencyConsumerId(`message-port:${id}`),
      name: id,
    })
    return {
      kind: 'execution',
      id,
      executionKind: 'message-port.invocation',
      capabilities: [],
      compiled: Object.freeze({
        routes: snapshotMessagePortRoutes(definition.contract.routes),
        handler,
      }),
    }
  },
  validate({ executions }) {
    const methods = new Set<MessagePortProcedureName>()
    return executions.flatMap((execution) =>
      Object.keys(execution.compiled.routes).flatMap((name) => {
        const method = messagePortProcedureName(name)
        if (!methods.has(method)) {
          methods.add(method)
          return []
        }
        return [
          {
            code: 'LUTRE_MESSAGE_PORT_DUPLICATE_METHOD',
            message: `MessagePort method ${method} is declared more than once.`,
            path: execution.id,
          },
        ]
      }),
    )
  },
  createRuntime({ executions, applicationRuntime }) {
    return createMessagePortRuntime(executions, applicationRuntime)
  },
  projectGraph: ({ execution }) => ({
    methods: Object.keys(execution.compiled.routes),
  }),
  host: {
    namespace: 'messagePort',
    create: ({ runtime }) => ({
      invoke: (method, input) =>
        runtime.invoke(messagePortProcedureName(method), input),
    }),
  },
})
