import {
  contextKey,
  contract,
  defineApplication,
  defineModule,
  implementation,
  layer,
} from '@loutrejs/loutre'
import { http, validate } from '@loutrejs/loutre/http'
import { z } from 'zod'

const OK = {
  method: 'GET',
  path: '/ok',
  responses: { ok: { status: 200, body: z.string() } },
  pipeline: [http.controller],
} as const

// Contract node identity is dot-separated internally. Dots/empty names must not be accepted as a node key.
// @ts-expect-error dotted route keys make canonical node identity ambiguous
http({ 'a.b': OK })
// @ts-expect-error empty route keys cannot form a stable Contract node identity
http({ '': OK })
// @ts-expect-error prototype-mutating keys must not be accepted as route names
http({ __proto__: OK })

// A leaf and a branch are mutually exclusive shapes.
// @ts-expect-error leaf routes must not silently ignore nested routes
http({
  mixed: {
    ...OK,
    routes: { child: OK },
  },
})

// Exact node metadata catches public API typos instead of silently retaining ignored fields.
// @ts-expect-error unknown leaf metadata should be rejected
http({
  typo: {
    ...OK,
    pipline: [http.controller],
  },
})

// @ts-expect-error unknown branch metadata should be rejected
http({
  branch: {
    path: '/branch',
    routes: { child: OK },
    requset: {},
  },
})

const SESSION = contextKey('adversarial.session').of<string>()
const USER = contextKey('adversarial.user').of<string>()

const provideSession = layer({
  name: 'provideSession',
  provides: [SESSION],
  factory: () => async (_ctx, next) => next({ 'adversarial.session': 's1' }),
})

const requireSession = layer({
  name: 'requireSession',
  requires: [SESSION],
  provides: [USER],
  factory: () => async (ctx, next) =>
    next({ 'adversarial.user': ctx['adversarial.session'] }),
})

const provideSessionAgain = layer({
  name: 'provideSessionAgain',
  provides: [SESSION],
  factory: () => async (_ctx, next) => next({ 'adversarial.session': 's2' }),
})

const requireValidatedParams = layer({
  name: 'requireValidatedParams',
  requiresValidated: ['params'],
  factory: () => async (_ctx, next) => next(),
})

// @ts-expect-error requires must be satisfied by an earlier layer
http({
  invalidOrder: {
    ...OK,
    pipeline: [requireSession, provideSession, http.controller],
  },
})

// @ts-expect-error a Context Key must not be implicitly provided twice
http({
  duplicateProvide: {
    ...OK,
    pipeline: [provideSession, provideSessionAgain, http.controller],
  },
})

// @ts-expect-error requiresValidated must appear after the matching validation layer
http({
  invalidValidationOrder: {
    method: 'GET',
    path: '/users/{id}',
    request: { params: { id: z.string() } },
    responses: { ok: { status: 200, body: z.string() } },
    pipeline: [requireValidatedParams, validate.params, http.controller],
  },
})

const ValidContract = contract([
  http({
    valid: {
      method: 'GET',
      path: '/users/{id}',
      request: { params: { id: z.string() } },
      responses: { ok: { status: 200, body: z.string() } },
      pipeline: [
        provideSession,
        requireSession,
        validate.params,
        requireValidatedParams,
        http.controller,
      ],
    },
  }),
])

const NestedContract = contract([
  http({
    api: {
      path: '/api',
      routes: ValidContract.http,
    },
  }),
])

// Resolved subtree implementation binding is not a canonical primitive: bind a leaf node instead.
implementation({
  name: 'BranchController',
  // @ts-expect-error resolved branch must not be accepted as an Implementation binding
  contract: NestedContract.http.api,
  protocol: http,
  factory: (() => ({})) as never,
})

const LeafController = implementation({
  name: 'LeafController',
  contract: NestedContract.http.api.valid,
  protocol: http,
  factory: () => ({
    valid(ctx) {
      return ctx.response.ok({ body: ctx.params.id })
    },
  }),
})

implementation({
  name: 'DuplicateProcedureSelection',
  contract: ValidContract,
  protocol: http,
  // @ts-expect-error duplicate partial procedure selections should fail statically
  procedures: ['valid', 'valid'],
  factory: () => ({
    valid(ctx) {
      return ctx.response.ok({ body: ctx.params.id })
    },
  }),
})

const Module = defineModule(() => ({ implementations: [LeafController] }))
defineApplication({ contract: NestedContract, modules: [Module()] })

const DUPLICATE_NAME_A = contextKey('adversarial.duplicate').of<string>()
const DUPLICATE_NAME_B = contextKey('adversarial.duplicate').of<number>()

// @ts-expect-error one Layer cannot provide the same Context Key twice
layer({
  name: 'duplicateProvideDeclaration',
  provides: [SESSION, SESSION],
  factory: () => async (_ctx, next) =>
    next({ 'adversarial.session': 'duplicate' }),
})

// @ts-expect-error Context is materialized by property name, so duplicate names are invalid even for distinct keys
layer({
  name: 'duplicateProvideName',
  provides: [DUPLICATE_NAME_A, DUPLICATE_NAME_B],
  factory: () => async (_ctx, next) =>
    next({ 'adversarial.duplicate': 'ambiguous' as never }),
})

// @ts-expect-error a Layer cannot require and then implicitly overwrite the same Context property
layer({
  name: 'requireAndProvideSameContext',
  requires: [SESSION],
  provides: [SESSION],
  factory: () => async (_ctx, next) =>
    next({ 'adversarial.session': 'replacement' }),
})

// @ts-expect-error duplicate requires are redundant and should be rejected at definition time
layer({
  name: 'duplicateRequireDeclaration',
  requires: [SESSION, SESSION],
  factory: () => async (_ctx, next) => next(),
})

// @ts-expect-error duplicate requiresValidated entries should be rejected at definition time
layer({
  name: 'duplicateValidatedRequirement',
  requiresValidated: ['params', 'params'],
  factory: () => async (_ctx, next) => next(),
})

const SharedNamespaceGroupA = http({
  api: {
    routes: {
      alpha: {
        method: 'GET',
        path: '/group-alpha',
        responses: { ok: { status: 200, body: z.string() } },
        pipeline: [http.controller],
      },
    },
  },
})
const SharedNamespaceGroupB = http({
  api: {
    routes: {
      beta: {
        method: 'GET',
        path: '/group-beta',
        responses: { ok: { status: 200, body: z.string() } },
        pipeline: [http.controller],
      },
    },
  },
})

// @ts-expect-error separate protocol groups cannot both own the same top-level Contract namespace node
contract([SharedNamespaceGroupA, SharedNamespaceGroupB])

// @ts-expect-error numeric object keys disappear from string-only type traversal but exist at runtime
http({ 1: OK })
// @ts-expect-error numeric-looking namespace keys are not stable architecture names
http({ '2': OK })

import type { ContextOf, ControllerOf } from '@loutrejs/loutre/http'

type ResolvedLeafController = ControllerOf<
  typeof NestedContract.http.api.valid,
  'http'
>
declare const resolvedLeafContext: ContextOf<ResolvedLeafController, 'valid'>
const resolvedParam: string = resolvedLeafContext.params.id
const resolvedUser: string = resolvedLeafContext['adversarial.user']
void [resolvedParam, resolvedUser]

// @ts-expect-error Context is materialized as an object property; __proto__ is unsafe
contextKey('__proto__').of<string>()
// @ts-expect-error empty Context property names are not meaningful
contextKey('').of<string>()

const nestedWrapper = layer({
  name: 'nestedWrapper',
  provides: [SESSION],
  factory: () => async (_ctx, next) =>
    next({ 'adversarial.session': 'nested' }),
})

// child pipeline sees Context provided by its wrapping Layer and returns to the parent terminal.
http({
  nestedOccurrence: {
    method: 'GET',
    path: '/nested-occurrence',
    responses: { ok: { status: 200, body: z.string() } },
    pipeline: [nestedWrapper([requireSession]), http.controller],
  },
})

// @ts-expect-error inherited providers cannot be overwritten by a descendant pipeline
http({
  parent: {
    pipeline: [provideSession],
    routes: {
      child: {
        ...OK,
        pipeline: [provideSessionAgain, http.controller],
      },
    },
  },
})

// @ts-expect-error HTTP method must be a non-empty token
http({
  emptyMethod: {
    ...OK,
    method: '',
  },
})

// @ts-expect-error whitespace is not valid inside an HTTP method token
http({
  spacedMethod: {
    ...OK,
    method: 'GET ',
  },
})

// extension methods remain valid as long as they are HTTP tokens
http({
  copyMethod: {
    ...OK,
    method: 'COPY',
  },
})

// @ts-expect-error HTTP response status must be a valid three-digit status code
http({
  invalidStatusLow: {
    ...OK,
    responses: { bad: { status: 42, body: z.string() } },
  },
})

// @ts-expect-error HTTP response status must stay in the valid 100-599 range
http({
  invalidStatusHigh: {
    ...OK,
    responses: { bad: { status: 999, body: z.string() } },
  },
})

// @ts-expect-error 204 cannot use a body-producing schema
http({
  invalidNoContentBody: {
    ...OK,
    responses: { noContent: { status: 204, body: z.string() } },
  },
})

http({
  validNoContent: {
    ...OK,
    responses: { noContent: { status: 204, body: z.undefined() } },
  },
})
