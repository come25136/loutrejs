import { graphql } from '@loutrejs/graphql'
import { defineApplication, defineModule, inject } from '@loutrejs/loutre'
import { CommerceService } from './domain/commerce.js'
import { manifest } from './generated/manifest.js'
export const OrdersModule = defineModule(
  ({ path }: { readonly path: string }) => ({
    providers: [CommerceService],
    executions: [
      graphql.endpoint({
        name: 'Orders',
        path,
        manifest,
        transports: { http: true, websocket: true },
        factory: (commerce = inject(CommerceService)) => ({
          context: ({ signal }) => ({ commerce, signal }),
        }),
      }),
    ],
  }),
)
export default defineApplication({
  modules: [OrdersModule({ path: '/graphql' })],
})
