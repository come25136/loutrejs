import {
  type,
  contract,
  defineApplication,
  defineModule,
  implementation,
  layer,
} from '@loutrejs/loutre'
import { compileApplication } from '@loutrejs/loutre/graph'
import { generateOpenApi } from '@loutrejs/loutre/openapi'
import { bootstrap } from '@loutrejs/loutre/host'
import { createHttpClient, http, validate } from '@loutrejs/loutre/http'
import { z } from 'zod'
import { silentLogger } from './helpers/silent-logger.js'

describe('Nested Contract composition', () => {
  const requestScope = layer({
    name: 'nested.requestScope',

    state: type<{ 'nested.requestScope': string }>(),
    factory: () => async (_ctx, next) => {
      await next({ 'nested.requestScope': 'request-1' })
    },
  })

  const authentication = layer({
    name: 'nested.authentication',
    requires: [requestScope],

    state: type<{
      'nested.currentUser': { readonly id: string }
    }>(),
    factory: () => async (ctx, next) => {
      await next({
        'nested.currentUser': {
          id: `user:${ctx.state['nested.requestScope']}`,
        },
      })
    },
  })

  const ProfileContract = contract([
    http({
      get: {
        method: 'GET',
        path: '/profile/{id}',
        request: { params: { id: z.string().min(2) } },
        responses: {
          ok: {
            status: 200,
            body: z.object({
              id: z.string(),
              userId: z.string(),
              scope: z.string(),
            }),
          },
        },
        pipeline: [validate.params, http.controller],
      },
    }),
  ])

  const AppContract = contract([
    http({
      api: {
        path: '/api',
        pipeline: [requestScope],
        responses: {
          unavailable: {
            status: 503,
            body: z.object({ error: z.string() }),
          },
        },
        routes: {
          me: {
            path: '/me',
            pipeline: [authentication],
            responses: {
              unauthorized: {
                status: 401,
                body: z.object({ error: z.string() }),
              },
            },
            routes: {
              profile: ProfileContract.http.get,
            },
          },
        },
      },
    }),
  ])

  const ProfileController = implementation({
    name: 'NestedProfileController',
    contract: AppContract.http.api.me.profile,
    protocol: http,

    factory: () => ({
      get(ctx) {
        return ctx.response.ok({
          body: {
            id: ctx.input.params.id,
            userId: ctx.state['nested.currentUser'].id,
            scope: ctx.state['nested.requestScope'],
          },
        })
      },
    }),
  })

  const ProfileModule = defineModule(() => ({
    implementations: [ProfileController],
  }))

  it('ancestor metadataを解決したleafへImplementationをbindして実行する', async () => {
    const definition = defineApplication({
      modules: [ProfileModule()],
      logger: silentLogger,
    })
    const application = bootstrap({ application: definition })

    const response = await application.fetch(
      new Request('http://fixture.test/api/me/profile/p1'),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      id: 'p1',
      userId: 'user:request-1',
      scope: 'request-1',
    })

    const notMountedAtFragmentPath = await application.fetch(
      new Request('http://fixture.test/profile/p1'),
    )
    expect(notMountedAtFragmentPath.status).toBe(404)

    await application.close()
  })

  it('resolved nodeはopaqueで、root identityとcanonical procedureをGraphへ保持する', () => {
    expect(Object.keys(AppContract.http.api)).toEqual(['me'])
    expect(Object.keys(AppContract.http.api.me.profile)).toEqual([])
    expect('kind' in AppContract.http.api.me.profile).toBe(false)
    expect('procedures' in AppContract.http.api.me.profile).toBe(false)
    expect(AppContract.http.api.me.profile).toBe(
      AppContract.http.api.me.profile,
    )

    const result = compileApplication({
      modules: [ProfileModule()],
    })
    expect(result.diagnostics).toEqual([])
    expect(result.graph.contracts).toHaveLength(1)
    expect(
      result.graph.contracts[0]?.procedures.map(({ name }) => name),
    ).toEqual(['api.me.profile'])
    expect(result.graph.pipelines[0]).toMatchObject({
      contract: 'contract:1',
      procedure: 'api.me.profile',
      protocol: 'http',
    })
    expect(result.graph.pipelines[0]?.layers.map(({ name }) => name)).toEqual([
      'nested.requestScope',
      'nested.authentication',
      'validate.params',
      'http.controller',
    ])
  })

  it('同じfragmentを複数mountしてもresolved node identityを共有しない', () => {
    const MultiMountContract = contract([
      http({
        public: {
          path: '/public',
          routes: { profile: ProfileContract.http.get },
        },
        admin: {
          path: '/admin',
          pipeline: [requestScope, authentication],
          routes: { profile: ProfileContract.http.get },
        },
      }),
    ])

    expect(MultiMountContract.http.public.profile).not.toBe(
      MultiMountContract.http.admin.profile,
    )
    expect(
      MultiMountContract.procedures['public.profile']?.protocols.http
        .dispatchKey,
    ).toBe('http:GET:/public/profile/{}')
    expect(
      MultiMountContract.procedures['admin.profile']?.protocols.http
        .dispatchKey,
    ).toBe('http:GET:/admin/profile/{}')
  })

  it('Application Contractを基準にmissing/duplicate defineImplementationを検証する', () => {
    const CoverageContract = contract([
      http({
        api: {
          routes: {
            profile: ProfileContract.http.get,
            settings: {
              method: 'GET',
              path: '/settings',
              responses: { ok: { status: 200, body: z.string() } },
              pipeline: [http.controller],
            },
          },
        },
      }),
    ])
    const ProfileOnly = implementation({
      name: 'ProfileOnly',
      contract: CoverageContract.http.api.profile,
      protocol: http,

      factory: () => ({
        get(ctx) {
          return ctx.response.ok({
            body: { id: ctx.input.params.id, userId: 'user', scope: 'scope' },
          })
        },
      }),
    })
    const DuplicateProfile = implementation({
      name: 'DuplicateProfile',
      contract: CoverageContract.http.api.profile,
      protocol: http,

      factory: ProfileOnly.factory,
    })
    const Module = defineModule(() => ({
      implementations: [ProfileOnly, DuplicateProfile],
    }))

    const codes = compileApplication({
      contract: CoverageContract,
      modules: [Module()],
    }).diagnostics.map(({ code }) => code)

    expect(codes).toContain('LUTRE_IMPL_001')
    expect(codes).toContain('LUTRE_IMPL_002')
  })

  it('OpenAPIとTyped Clientもresolved Contract treeをsource of truthにする', async () => {
    const definition = defineApplication({
      modules: [ProfileModule()],
      logger: silentLogger,
    })
    const document = generateOpenApi(definition, {
      info: { title: 'Nested API', version: '1.0.0' },
      operationId: ({ procedure }) => procedure,
    })

    expect(document.paths['/api/me/profile/{id}']?.get).toEqual(
      expect.objectContaining({ operationId: 'api.me.profile' }),
    )

    let captured: { readonly method: string; readonly path: string } | undefined
    const client = createHttpClient(
      AppContract.http.api.me,
      async (request) => {
        captured = request
        return {
          status: 200,
          body: { id: 'p1', userId: 'user-1', scope: 'request-1' },
        }
      },
    )

    const response = await client.profile({ params: { id: 'p1' } })
    expect(captured).toMatchObject({
      method: 'GET',
      path: '/api/me/profile/p1',
    })
    expect(response.body).toEqual({
      id: 'p1',
      userId: 'user-1',
      scope: 'request-1',
    })
  })

  it('Application ContractをImplementationのresolved nodeから推論する', () => {
    const application = defineApplication({ modules: [ProfileModule()] })
    const document = generateOpenApi(application, {
      info: { title: 'Nested API', version: '1.0.0' },
      operationId: ({ procedure }) => procedure,
    })

    expect(document.paths['/api/me/profile/{id}']?.get).toMatchObject({
      operationId: 'api.me.profile',
    })
  })

  it('resolved subtreeをtest Applicationのcomposition rootとして扱える', () => {
    const result = compileApplication({
      contract: AppContract.http.api.me,
      modules: [ProfileModule()],
    })

    expect(result.diagnostics).toEqual([])
    expect(result.graph.contracts).toHaveLength(1)
    expect(
      result.graph.contracts[0]?.procedures.map(({ name }) => name),
    ).toEqual(['profile'])
    expect(result.graph.pipelines[0]).toMatchObject({
      contract: 'contract:1',
      procedure: 'profile',
    })
  })

  it('型境界を迂回しても危険なHTTP node shapeをruntimeで拒否する', () => {
    expect(() =>
      (http as any)({
        'a.b': { ...ProfileContract.procedures.get?.protocols.http.definition },
      }),
    ).toThrow(/Invalid HTTP Contract node name/)
    expect(() =>
      (http as any)({
        mixed: {
          method: 'GET',
          path: '/mixed',
          responses: { ok: { status: 200, body: z.string() } },
          pipeline: [http.controller],
          routes: {},
        },
      }),
    ).toThrow(/Unknown HTTP Contract node property: routes/)
  })

  it('resolved branch Implementation bindはruntimeでも拒否する', () => {
    expect(() =>
      (implementation as any)({
        name: 'InvalidBranchController',
        contract: AppContract.http.api.me,
        protocol: http,
        factory: () => ({}),
      }),
    ).toThrow(/resolved leaf Contract node/)
  })

  it('inherited response variantのruntime collisionも拒否する', () => {
    expect(() =>
      contract([
        (http as any)({
          api: {
            responses: {
              ok: { status: 200, body: z.string() },
            },
            routes: ProfileContract.http,
          },
        }),
      ]),
    ).toThrow(/Duplicate inherited HTTP response: ok/)
  })
})
