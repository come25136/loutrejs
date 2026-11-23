import { http } from '@loutrejs/loutre/http'
import { graphql } from '@loutrejs/graphql'
import { application, module, inject } from '@loutrejs/loutre'
import { manifest } from './graphql/manifest.js'
import { OrdersModule } from '../examples/graphql-orders/src/app.js'
import { ConformanceState } from './graphql/context.js'

export function graphQLConformanceApplication(
  httpEnabled = true,
  path = '/graphql',
) {
  const endpoint = graphql.implementation({
    name: 'Conformance',
    route: http.contract({
      graphql: { raw: true, method: '*', path: path },
    }).routes.graphql,
    manifest,
    transports: { http: httpEnabled, websocket: true },
    factory: (state = inject(ConformanceState)) => ({
      context: (input) => ({ signal: input.signal, state }),
    }),
  })
  const Module = module(() => ({
    providers: [ConformanceState],
    executions: [endpoint],
  }))
  return application({
    modules: [
      Module(),
      OrdersModule({ path: httpEnabled ? '/commerce' : '/commerce-ws-only' }),
    ],
  })
}
