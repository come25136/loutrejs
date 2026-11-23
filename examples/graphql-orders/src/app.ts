import { application, module } from '@loutrejs/loutre'
import { CommerceService } from './domain/commerce.js'
import { createOrdersGraphQL } from './graphql/endpoint.js'
import { createApiContract } from './http/endpoint.js'

export const OrdersModule = module(({ path }: { readonly path: string }) => {
  const apiContract = createApiContract(path)

  return {
    providers: [CommerceService],
    executions: [createOrdersGraphQL(apiContract.routes.graphql)],
  }
})

export default application({
  modules: [OrdersModule({ path: '/graphql' })],
})
