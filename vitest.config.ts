import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@loutrejs/loutre/message-port': resolve(
        'packages/loutre/src/message-port/index.ts',
      ),
      '@loutrejs/loutre/tasks': resolve('packages/loutre/src/tasks/index.ts'),
      '@loutrejs/loutre/websocket': resolve(
        'packages/loutre/src/websocket/index.ts',
      ),
      '@loutrejs/loutre/http/openapi': resolve(
        'packages/loutre/src/http/openapi.ts',
      ),
      '@loutrejs/loutre/presentation': resolve(
        'packages/loutre/src/presentation.ts',
      ),
      '@loutrejs/loutre/graph': resolve('packages/loutre/src/graph/index.ts'),
      '@loutrejs/loutre/runtime/bun': resolve(
        'packages/loutre/src/adapters/bun.ts',
      ),
      '@loutrejs/loutre/runtime/deno': resolve(
        'packages/loutre/src/adapters/deno.ts',
      ),
      '@loutrejs/loutre/runtime/cloudflare-workers': resolve(
        'packages/loutre/src/adapters/cloudflare-workers.ts',
      ),
      '@loutrejs/loutre/runtime/aws-lambda': resolve(
        'packages/loutre/src/adapters/aws-lambda.ts',
      ),
      '@loutrejs/loutre/runtime/electron': resolve(
        'packages/loutre/src/adapters/electron.ts',
      ),
      '@loutrejs/loutre/runtime': resolve(
        'packages/loutre/src/runtime/index.ts',
      ),
      '@loutrejs/loutre/http': resolve('packages/loutre/src/http/index.ts'),
      '@loutrejs/loutre': resolve('packages/loutre/src/index.ts'),
      '@loutrejs/node': resolve('packages/node/src/index.ts'),
      '@loutrejs/bullmq': resolve('packages/bullmq/src/index.ts'),
      '@loutrejs/cli': resolve('packages/cli/src/index.ts'),
    },
  },
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
  },
})
