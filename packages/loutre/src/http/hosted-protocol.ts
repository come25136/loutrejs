import { http as baseHttp } from './definitions.js'
import {
  bindHttpServer,
  defineHttpContract,
  defineHttpImplementation,
  httpExecutionExtension,
  HTTP_SERVER,
} from './extension.js'

export const http: typeof baseHttp & {
  readonly capabilities: readonly ['http']
  readonly contract: typeof defineHttpContract
  readonly implementation: typeof defineHttpImplementation
  readonly extension: typeof httpExecutionExtension
  readonly serverCapability: typeof HTTP_SERVER
  readonly bindServer: typeof bindHttpServer
} = Object.assign(baseHttp, {
  capabilities: ['http'] as const,
  contract: defineHttpContract,
  implementation: defineHttpImplementation,
  extension: httpExecutionExtension,
  serverCapability: HTTP_SERVER,
  bindServer: bindHttpServer,
})
