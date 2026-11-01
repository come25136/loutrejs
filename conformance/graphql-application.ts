import { http as contractHttp } from '@loutrejs/loutre/http'
import { graphql } from '@loutrejs/graphql'
import { defineApplication, defineModule, inject } from '@loutrejs/loutre'
import { manifest } from './graphql/manifest.js'
import { OrdersModule } from '../examples/graphql-orders/src/app.js'
import { ConformanceState } from './graphql/context.js'

export function graphQLConformanceApplication(http = true, path = '/graphql') {
  const endpoint = graphql.implementation({
    name: 'Conformance',
    route: contractHttp.contract({
      graphql: { raw: true, method: '*', path: path },
    }).routes.graphql,
    manifest,
    http,
    ws: true,
    factory: (state = inject(ConformanceState)) => ({
      context: (input) => ({ signal: input.signal, state }),
    }),
  })
  const Module = defineModule(() => ({
    providers: [ConformanceState],
    executions: [endpoint],
  }))
  return defineApplication({
    modules: [
      Module(),
      OrdersModule({ path: http ? '/commerce' : '/commerce-ws-only' }),
    ],
  })
}
