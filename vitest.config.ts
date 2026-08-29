import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@loutrejs/loutre/host': resolve(
        'packages/loutre/src/application/host.ts',
      ),
      '@loutrejs/loutre/binding': resolve(
        'packages/loutre/src/application/binding.ts',
      ),
      '@loutrejs/loutre/openapi': resolve(
        'packages/loutre/src/application/openapi.ts',
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
      '@loutrejs/loutre/message-port/environment': resolve(
        'packages/loutre/src/message-port/environment.ts',
      ),
      '@loutrejs/loutre/message-port': resolve(
        'packages/loutre/src/message-port/index.ts',
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
