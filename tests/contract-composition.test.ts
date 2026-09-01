import {
  contract,
  protocolGroup,
  type ProtocolDescriptor,
} from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { z } from 'zod'

function protocol<const TName extends string>(
  name: TName,
  dispatchKey: string | null,
): ProtocolDescriptor<TName> {
  return {
    kind: 'protocol',
    protocol: name,
    dispatchKey,
  }
}

describe('Contract composition', () => {
  it('1つのHTTP groupへ複数routeを定義できる', () => {
    const Contract = contract([
      http({
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
      }),
    ])

    expect(Object.keys(Contract.procedures)).toEqual(['get', 'create'])
    expect(Contract.procedures.get?.protocols.http.dispatchKey).toBe(
      'http:GET:/users/{}',
    )
    expect(Contract.procedures.create?.protocols.http.dispatchKey).toBe(
      'http:POST:/users',
    )
  })

  it('同じHTTP protocolの複数groupをnamespaceへ統合できる', () => {
    const Contract = contract([
      http({
        get: {
          method: 'GET',
          path: '/users/{id}',
          responses: { ok: { status: 200, body: z.string() } },
          pipeline: [http.controller],
        },
      }),
      http({
        create: {
          method: 'POST',
          path: '/users',
          responses: { created: { status: 201, body: z.string() } },
          pipeline: [http.controller],
        },
      }),
    ])

    expect(Object.keys(Contract.http)).toEqual(['get', 'create'])
    expect(Object.keys(Contract.procedures)).toEqual(['get', 'create'])
  })

  it('同じprocedureへ異なるprotocol groupを重ねられる', () => {
    const Contract = contract([
      protocolGroup('graphql', {
        create: protocol('graphql', 'graphql:Mutation.createUser'),
      }),
      protocolGroup('websocket', {
        create: protocol('websocket', 'websocket:user.created'),
      }),
      protocolGroup('sse', {
        create: protocol('sse', 'sse:user.created'),
      }),
    ])

    expect(Object.keys(Contract.procedures.create?.protocols ?? {})).toEqual([
      'graphql',
      'websocket',
      'sse',
    ])
  })

  it('同じprocedureとprotocolを複数groupから定義すると拒否する', () => {
    const first = http({
      get: {
        method: 'GET',
        path: '/users',
        responses: { ok: { status: 200, body: z.string() } },
        pipeline: [http.controller],
      },
    })
    const second = http({
      get: {
        method: 'GET',
        path: '/legacy-users',
        responses: { ok: { status: 200, body: z.string() } },
        pipeline: [http.controller],
      },
    })

    expect(() => (contract as any)([first, second])).toThrow(
      /Duplicate contract procedure protocol: get\.http/,
    )
  })

  it('分割したContractをprocedure単位でmergeできる', () => {
    const ReadContract = contract([
      http({
        get: {
          method: 'GET',
          path: '/users/{id}',
          responses: { ok: { status: 200, body: z.string() } },
          pipeline: [http.controller],
        },
      }),
    ])
    const GraphqlContract = contract([
      protocolGroup('graphql', {
        get: protocol('graphql', 'graphql:Query.user'),
      }),
    ])
    const EventsContract = contract([
      protocolGroup('websocket', {
        subscribe: protocol('websocket', 'websocket:user.events'),
      }),
      protocolGroup('sse', {
        subscribe: protocol('sse', 'sse:user.events'),
      }),
    ])

    const Contract = contract.merge([
      ReadContract,
      GraphqlContract,
      EventsContract,
    ])

    expect(Object.keys(Contract.procedures)).toEqual(['get', 'subscribe'])
    expect(Object.keys(Contract.procedures.get?.protocols ?? {})).toEqual([
      'http',
      'graphql',
    ])
    expect(Object.keys(Contract.procedures.subscribe?.protocols ?? {})).toEqual(
      ['websocket', 'sse'],
    )
  })

  it('空のmergeを拒否する', () => {
    expect(() => (contract.merge as any)([])).toThrow(
      /requires at least one Contract/,
    )
  })

  it('merge時にHTTP methodとroute patternの重複を拒否する', () => {
    const First = contract([
      http({
        get: {
          method: 'GET',
          path: '/users/{id}',
          responses: { ok: { status: 200, body: z.string() } },
          pipeline: [http.controller],
        },
      }),
    ])
    const Second = contract([
      http({
        find: {
          method: 'get',
          path: '/users/{userId}',
          responses: { ok: { status: 200, body: z.string() } },
          pipeline: [http.controller],
        },
      }),
    ])

    expect(() => (contract.merge as any)([First, Second])).toThrow(
      /Duplicate protocol dispatch key "http:GET:\/users\/\{\}"/,
    )
  })

  it('merge時に同じprocedureとprotocolの二重定義を拒否する', () => {
    const First = contract([
      http({
        get: {
          method: 'GET',
          path: '/users',
          responses: { ok: { status: 200, body: z.string() } },
          pipeline: [http.controller],
        },
      }),
    ])
    const Second = contract([
      http({
        get: {
          method: 'GET',
          path: '/legacy-users',
          responses: { ok: { status: 200, body: z.string() } },
          pipeline: [http.controller],
        },
      }),
    ])

    expect(() => (contract.merge as any)([First, Second])).toThrow(
      /Duplicate contract procedure protocol: get\.http/,
    )
  })
})
