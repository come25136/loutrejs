import { defineApplication, defineModule } from '@loutrejs/loutre'
import { CommerceService } from './domain/commerce.js'
import { createOrdersGraphQL } from './graphql/endpoint.js'
import { createApiContract } from './http/contract.js'

export const OrdersModule = defineModule(
  ({ path }: { readonly path: string }) => {
    const api = createApiContract(path)

    return {
      providers: [CommerceService],
      executions: [createOrdersGraphQL(api.routes.graphql)],
    }
  },
)

export default defineApplication({
  modules: [OrdersModule({ path: '/graphql' })],
})
