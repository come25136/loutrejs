import { http } from '@loutrejs/loutre/http'
import { graphql } from '@loutrejs/graphql'
import { defineApplication, defineModule, inject } from '@loutrejs/loutre'
import { CommerceService } from './domain/commerce.js'
import { manifest } from './graphql/manifest.js'
export const OrdersModule = defineModule(
  ({ path }: { readonly path: string }) => {
    const ApiContract = http.contract({
      graphql: { raw: true, method: '*', path },
    })
    return {
      providers: [CommerceService],
      executions: [
        graphql.implementation({
          name: 'Orders',
          route: ApiContract.routes.graphql,
          manifest,
          http: true,
          ws: true,
          factory: (commerce = inject(CommerceService)) => ({
            context: ({ signal }) => ({ commerce, signal }),
          }),
        }),
      ],
    }
  },
)
export default defineApplication({
  modules: [OrdersModule({ path: '/graphql' })],
})
