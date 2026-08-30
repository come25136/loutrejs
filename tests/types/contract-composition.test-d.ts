import {
  contract,
  defineProtocolContract,
  protocolGroup,
  type ProtocolDescriptor,
} from '@loutrejs/loutre'
import { type ControllerOf, http } from '@loutrejs/loutre/http'
import { z } from 'zod'

const HttpContract = http.contract({
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

type HttpController = ControllerOf<typeof HttpContract, 'http'>
declare const controller: HttpController
controller.get
controller.create

const graphql = {
  kind: 'protocol',
  protocol: 'graphql',
  dispatchKey: 'graphql:Mutation.createUser',
} as const satisfies ProtocolDescriptor<'graphql'>

const GraphqlContract = defineProtocolContract(
  protocolGroup('graphql', { create: graphql }),
)
const MergedContract = contract.merge(HttpContract, GraphqlContract, {
  name: 'MergedContract',
})

const mergedHttp = MergedContract.procedures.create.protocols.http
const mergedGraphql = MergedContract.procedures.create.protocols.graphql
void [mergedHttp, mergedGraphql]

// @ts-expect-error param名だけが異なる同一routeはdispatch identityが重複する
http.contract({
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
