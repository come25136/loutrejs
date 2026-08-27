import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  resolve: {
    alias: {
      '@loutrejs/application/openapi': resolve(
        'packages/application/src/openapi.ts',
      ),
      '@loutrejs/application/host': resolve('packages/application/src/host.ts'),
      '@loutrejs/application/binding': resolve(
        'packages/application/src/binding.ts',
      ),
      '@loutrejs/application': resolve('packages/application/src/index.ts'),
      '@loutrejs/core': resolve('packages/core/src/index.ts'),
      '@loutrejs/graph': resolve('packages/graph/src/index.ts'),
      '@loutrejs/cli': resolve('packages/cli/src/index.ts'),
      '@loutrejs/runtime': resolve('packages/runtime/src/index.ts'),
      '@loutrejs/http': resolve('packages/http/src/index.ts'),
      '@loutrejs/message-port/environment': resolve(
        'packages/message-port/src/environment.ts',
      ),
      '@loutrejs/message-port': resolve('packages/message-port/src/index.ts'),
      '@loutrejs/runtime-node': resolve('packages/runtime-node/src/index.ts'),
      '@loutrejs/runtime-deno': resolve('packages/runtime-deno/src/index.ts'),
      '@loutrejs/runtime-bun': resolve('packages/runtime-bun/src/index.ts'),
      '@loutrejs/runtime-workerd': resolve(
        'packages/runtime-workerd/src/index.ts',
      ),
      '@loutrejs/runtime-electron': resolve(
        'packages/runtime-electron/src/index.ts',
      ),
      '@loutrejs/runtime-lambda': resolve(
        'packages/runtime-lambda/src/index.ts',
      ),
    },
  },
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
  },
})
