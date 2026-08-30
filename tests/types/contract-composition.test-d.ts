import {
  contract,
  protocolGroup,
  type ProtocolDescriptor,
} from '@loutrejs/loutre'
import { type ControllerOf, http } from '@loutrejs/loutre/http'
import { z } from 'zod'

const HttpGroup = http({
  get: {
    method: 'GET',
    path: '/users/{id}',
    responses: { ok: { status: 200, body: z.string() } },
    pipeline: [http.controller],
  },
  create: {
    method: 'POST',
    path: '/users',
    responses: { created: { status: 201, body: z.string() } },
    pipeline: [http.controller],
  },
})
const HttpContract = contract([HttpGroup])

type HttpController = ControllerOf<typeof HttpContract, 'http'>
declare const controller: HttpController
controller.get
controller.create

const graphql = {
  kind: 'protocol',
  protocol: 'graphql',
  dispatchKey: 'graphql:Mutation.createUser',
} as const satisfies ProtocolDescriptor<'graphql'>

const GraphqlGroup = protocolGroup('graphql', { create: graphql })
const GraphqlContract = contract([GraphqlGroup])
const DirectContract = contract([HttpGroup, GraphqlGroup])
const protocolGroups = [HttpGroup, GraphqlGroup]
const ArrayContract = contract(protocolGroups)
const directHttp = DirectContract.procedures.create.protocols.http
const arrayGraphql = ArrayContract.procedures.create.protocols.graphql
const directGraphql = DirectContract.procedures.create.protocols.graphql
void [directHttp, directGraphql, arrayGraphql]
const MergedContract = contract.merge([HttpContract, GraphqlContract])
const contracts = [HttpContract, GraphqlContract]
const ArrayMergedContract = contract.merge(contracts)

const AdditionalHttpContract = contract([
  http({
    list: {
      method: 'GET',
      path: '/organizations',
      responses: { ok: { status: 200, body: z.string() } },
      pipeline: [http.controller],
    },
  }),
])
contract.merge([HttpContract, AdditionalHttpContract])

const ConflictingHttpContract = contract([
  http({
    find: {
      method: 'get',
      path: '/users/{userId}',
      responses: { ok: { status: 200, body: z.string() } },
      pipeline: [http.controller],
    },
  }),
])

// @ts-expect-error merge後にHTTP method + route patternが重複するContractは拒否する
contract.merge([HttpContract, ConflictingHttpContract])

const DuplicateProcedureHttpContract = contract([
  http({
    get: {
      method: 'GET',
      path: '/legacy-users/{id}',
      responses: { ok: { status: 200, body: z.string() } },
      pipeline: [http.controller],
    },
  }),
])

// @ts-expect-error merge後に同じprocedure key + protocolが重複するContractは拒否する
contract.merge([HttpContract, DuplicateProcedureHttpContract])

const DuplicateProcedureHttpGroup = http({
  get: {
    method: 'GET',
    path: '/archived-users/{id}',
    responses: { ok: { status: 200, body: z.string() } },
    pipeline: [http.controller],
  },
})

// @ts-expect-error 同じprocedure key + protocolを持つgroupは同一Contractへ重ねられない
contract([HttpGroup, DuplicateProcedureHttpGroup])

const mergedHttp = MergedContract.procedures.create.protocols.http
const mergedGraphql = MergedContract.procedures.create.protocols.graphql
const arrayMergedGraphql =
  ArrayMergedContract.procedures.create.protocols.graphql
void [mergedHttp, mergedGraphql, arrayMergedGraphql]

const DuplicateHttpGroup = http({
  first: {
    method: 'GET',
    path: '/duplicates/{id}',
    responses: { ok: { status: 200, body: z.string() } },
    pipeline: [http.controller],
  },
  second: {
    method: 'get',
    path: '/duplicates/{userId}',
    responses: { ok: { status: 200, body: z.string() } },
    pipeline: [http.controller],
  },
})

// @ts-expect-error Contract配列内のdispatch identity重複を拒否する
contract([DuplicateHttpGroup])

// @ts-expect-error 空のprotocol group配列は拒否する
contract([])

// @ts-expect-error 空のContract配列は拒否する
contract.merge([])
