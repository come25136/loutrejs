import {
  delegateExecution,
  type ExecutionDefinition,
  type ExecutionExtension,
} from '@loutrejs/loutre'
import { http, type HttpRawExecutionContext } from '@loutrejs/loutre/http'

declare const target: ExecutionDefinition<ExecutionExtension>
const authentication = http.middleware<{ tenant: string }>({
  name: 'Authentication',
  factory: () => async (_context, next) => next({ tenant: '組織1' }),
})
const route = { method: 'GET', path: '/api', middlewares: [authentication] }
const handler = (context: HttpRawExecutionContext<{ tenant: string }>) =>
  Response.json({ tenant: context.state.tenant })
const delegate = delegateExecution(target, () => handler)
http.delegate({ route, delegate })
const ordinary = http.raw({
  route,
  factory: () => (context) => {
    const tenant: string = context.state.tenant
    // @ts-expect-error 宣言していないstateは公開しない
    context.state.secret
    return Response.json({ tenant })
  },
})

// @ts-expect-error 委任にはdelegateが必要
http.delegate({ route })
// @ts-expect-error 通常の実装にはfactoryが必要
http.raw({ route })
// @ts-expect-error factoryの入口でdelegateを受け付けない
http.raw({ route, delegate })
// @ts-expect-error 委任にfactoryを指定しない
http.delegate({ route, delegate, factory: ordinary.factory })
// @ts-expect-error factoryの入口でdelegateを指定しない
http.raw({ route, factory: ordinary.factory, delegate })
// @ts-expect-error routeが供給しないstateを要求するhandlerへ委任しない
http.delegate({ route: { method: 'GET', path: '/api' }, delegate })
http.delegate({
  route,
  // @ts-expect-error raw HTTP handlerはResponseを返す
  delegate: delegateExecution(target, () => () => '応答'),
})
