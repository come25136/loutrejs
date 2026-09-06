import type { RuntimeSupportProfile } from './capability.js'

/** CLIが`@loutrejs/node`へ依存するとBun/DenoでもNode.js専用moduleを評価するため、Capability metadataだけをruntime-neutral側へ分離する。 */
export const nodeRuntimeSupport = {
  runtime: 'node',
  capabilities: new Set([
    'http.server',
    'http.request.streaming',
    'http.response.streaming',
    'stream.readable',
    'stream.writable',
    'messagePort.send',
    'messagePort.receive',
    'messagePort.transfer',
    'runtime.longLived',
    'runtime.shutdownHook',
    'env.runtime',
    'crypto.random',
  ]),
} as const satisfies RuntimeSupportProfile
