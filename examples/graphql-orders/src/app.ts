import { application, module } from '@loutrejs/loutre'
import { CommerceService } from './domain/commerce.js'
import { createOrdersGraphQL } from './graphql/endpoint.js'
import { createApiContract } from './http/endpoint.js'

export const OrdersModule = module(({ path }: { readonly path: string }) => {
  const api = createApiContract(path)

  return {
    providers: [CommerceService],
    executions: [createOrdersGraphQL(api.routes.graphql)],
  }
})

export default application({
  modules: [OrdersModule({ path: '/graphql' })],
})
