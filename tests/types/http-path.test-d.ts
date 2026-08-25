import { contract, procedure, type SchemaInput } from '@loutrejs/core'
import {
  type ContextOf,
  type ControllerOf,
  http,
  validate,
} from '@loutrejs/http'
import { z } from 'zod'

const RawContract = contract({
  single: procedure({
    protocols: {
      http: http({
        method: 'GET',
        path: '/users/{id}',
        responses: { ok: { status: 200, body: z.string() } },
        pipeline: [http.controller],
      }),
    },
  }),
  multiple: procedure({
    protocols: {
      http: http({
        method: 'GET',
        path: '/users/{userId}/posts/{postId}',
        responses: { ok: { status: 200, body: z.string() } },
        pipeline: [http.controller],
      }),
    },
  }),
  transformed: procedure({
    protocols: {
      http: http({
        method: 'GET',
        path: '/numbers/{id}',
        request: { params: { id: z.coerce.number() } },
        responses: { ok: { status: 200, body: z.string() } },
        pipeline: [validate.params, http.controller],
      }),
    },
  }),
  declaredOnly: procedure({
    protocols: {
      http: http({
        method: 'GET',
        path: '/raw/{id}',
        request: { params: { id: z.coerce.number() } },
        responses: { ok: { status: 200, body: z.string() } },
        pipeline: [http.controller],
      }),
    },
  }),
  root: procedure({
    protocols: {
      http: http({
        method: 'GET',
        path: '/',
        responses: { ok: { status: 200, body: z.string() } },
        pipeline: [http.controller],
      }),
    },
  }),
})

type RawController = ControllerOf<typeof RawContract, 'http'>
declare const single: ContextOf<RawController, 'single'>
declare const multiple: ContextOf<RawController, 'multiple'>
declare const transformed: ContextOf<RawController, 'transformed'>
declare const declaredOnly: ContextOf<RawController, 'declaredOnly'>
declare const root: ContextOf<RawController, 'root'>

const singleId: string = single.params.id
const userId: string = multiple.params.userId
const postId: string = multiple.params.postId
const transformedId: number = transformed.params.id
const declaredOnlyId: string = declaredOnly.params.id
void [singleId, userId, postId, transformedId, declaredOnlyId]
// @ts-expect-error pathに存在しないparamは参照できない
single.params.userId
// @ts-expect-error root pathにはparamが存在しない
root.params.id

type CoercedNumberInput = SchemaInput<ReturnType<typeof z.coerce.number>>
const rawInput: CoercedNumberInput = '1'
void rawInput

http({
  method: 'GET',
  path: '/users/{id}',
  // @ts-expect-error params schema mapのkeyはpath paramと一致する必要がある
  request: { params: { userId: z.string() } },
  responses: { ok: { status: 200, body: z.string() } },
  pipeline: [validate.params, http.controller],
})

http({
  method: 'GET',
  path: '/users/{type}',
  request: { params: { type: z.literal('admin') } },
  responses: { ok: { status: 200, body: z.string() } },
  pipeline: [validate.params, http.controller],
})

http({
  method: 'GET',
  path: '/users/{id}/{postId}',
  // @ts-expect-error params schema mapにpath paramの全keyが必要
  request: { params: { id: z.string() } },
  responses: { ok: { status: 200, body: z.string() } },
  pipeline: [validate.params, http.controller],
})

http({
  method: 'GET',
  path: '/users/{id}',
  // @ts-expect-error params schema mapに余分なkeyは指定できない
  request: { params: { id: z.string(), extra: z.string() } },
  responses: { ok: { status: 200, body: z.string() } },
  pipeline: [validate.params, http.controller],
})

http({
  method: 'GET',
  path: '/users/{id}',
  // @ts-expect-error raw stringを入力できないschemaは指定できない
  request: { params: { id: z.number() } },
  responses: { ok: { status: 200, body: z.string() } },
  pipeline: [validate.params, http.controller],
})

http({
  method: 'GET',
  path: '/users/{id}',
  responses: { ok: { status: 200, body: z.string() } },
  // @ts-expect-error request.paramsがないvalidate.paramsは定義エラー
  pipeline: [validate.params, http.controller],
})

const pathTestDefinition = {
  method: 'GET',
  responses: { ok: { status: 200, body: z.string() } },
  pipeline: [http.controller],
} as const

// @ts-expect-error optional paramは未対応
http({ ...pathTestDefinition, path: '/users/{id?}' })
// @ts-expect-error wildcard paramは未対応
http({ ...pathTestDefinition, path: '/files/{*rest}' })
// @ts-expect-error 空のparam名は無効
http({ ...pathTestDefinition, path: '/users/{}' })
// @ts-expect-error 数字始まりのparam名は無効
http({ ...pathTestDefinition, path: '/users/{2id}' })
// @ts-expect-error hyphenを含むparam名は無効
http({ ...pathTestDefinition, path: '/users/{user-id}' })
// @ts-expect-error param名の重複は無効
http({ ...pathTestDefinition, path: '/users/{id}/{id}' })
// @ts-expect-error inline paramは未対応
http({ ...pathTestDefinition, path: '/users/foo-{id}' })
// @ts-expect-error trailing slashは無効
http({ ...pathTestDefinition, path: '/users/' })
// @ts-expect-error 空segmentは無効
http({ ...pathTestDefinition, path: '/users//posts' })
// @ts-expect-error queryをpathへ含められない
http({ ...pathTestDefinition, path: '/users?foo=bar' })
// @ts-expect-error fragmentをpathへ含められない
http({ ...pathTestDefinition, path: '/users#fragment' })

declare const widenedPath: string
http({
  method: 'GET',
  // @ts-expect-error widened string pathは拒否される
  path: widenedPath,
  responses: { ok: { status: 200, body: z.string() } },
  pipeline: [http.controller],
})

declare const widenedMethod: string
http({
  // @ts-expect-error widened string methodは拒否される
  method: widenedMethod,
  path: '/users',
  responses: { ok: { status: 200, body: z.string() } },
  pipeline: [http.controller],
})

declare const unionPath: '/users' | '/posts'
http({
  method: 'GET',
  // @ts-expect-error 複数候補を持つpathは単一literalではない
  path: unionPath,
  responses: { ok: { status: 200, body: z.string() } },
  pipeline: [http.controller],
})

// @ts-expect-error param名だけが異なる同一routeは重複する
contract({
  first: procedure({
    protocols: {
      http: http({
        method: 'GET',
        path: '/duplicates/{id}',
        responses: { ok: { status: 200, body: z.string() } },
        pipeline: [http.controller],
      }),
    },
  }),
  second: procedure({
    protocols: {
      http: http({
        method: 'get',
        path: '/duplicates/{userId}',
        responses: { ok: { status: 200, body: z.string() } },
        pipeline: [http.controller],
      }),
    },
  }),
})

contract({
  get: procedure({
    protocols: {
      http: http({
        method: 'GET',
        path: '/method/{id}',
        responses: { ok: { status: 200, body: z.string() } },
        pipeline: [http.controller],
      }),
    },
  }),
  post: procedure({
    protocols: {
      http: http({
        method: 'POST',
        path: '/method/{id}',
        responses: { ok: { status: 200, body: z.string() } },
        pipeline: [http.controller],
      }),
    },
  }),
})
