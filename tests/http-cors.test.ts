import {
  contract,
  defineModule,
  implementation,
  procedure,
} from '@loutrejs/core'
import { createHttpApplication, http, validate } from '@loutrejs/http'
import { z } from 'zod'
import { silentLogger } from './helpers/silent-logger.js'

describe('cors', () => {
  it('actual requestへ既定のwildcard originを付与する', async () => {
    const { application } = createFixture(validate.cors())

    const response = await application.handle(
      new Request('http://fixture.test/cors', {
        method: 'POST',
        headers: { origin: 'https://app.example' },
      }),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(response.headers.get('access-control-allow-credentials')).toBeNull()
  })

  it('明示originを反映しVaryとexpose headersをFramework境界でmergeする', async () => {
    const { application } = createFixture(
      validate.cors({
        origin: ['https://app.example', 'https://admin.example'],
        credentials: true,
        exposeHeaders: ['x-request-id'],
      }),
    )

    const response = await application.handle(
      new Request('http://fixture.test/cors', {
        method: 'POST',
        headers: { origin: 'https://app.example' },
      }),
    )

    expect(response.headers.get('access-control-allow-origin')).toBe(
      'https://app.example',
    )
    expect(response.headers.get('access-control-allow-credentials')).toBe(
      'true',
    )
    expect(response.headers.get('access-control-expose-headers')).toBe(
      'x-request-id',
    )
    expect(response.headers.get('vary')).toBe('Accept, Origin')
  })

  it('preflightをControllerへ流さず204で完結させる', async () => {
    const { application, executions } = createFixture(validate.cors())

    const response = await application.handle(
      new Request('http://fixture.test/cors', {
        method: 'OPTIONS',
        headers: {
          origin: 'https://app.example',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type, x-token',
        },
      }),
    )

    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(response.headers.get('access-control-allow-methods')).toBe('POST')
    expect(response.headers.get('access-control-allow-headers')).toBe(
      'content-type, x-token',
    )
    expect(response.headers.get('vary')).toContain(
      'Access-Control-Request-Method',
    )
    expect(response.headers.get('vary')).toContain(
      'Access-Control-Request-Headers',
    )
    expect(executions()).toBe(0)
  })

  it('validation errorにもCORS headerを付与する', async () => {
    const application = createValidationFixture(
      validate.cors({ origin: 'https://app.example' }),
    )

    const response = await application.handle(
      new Request('http://fixture.test/cors-validation', {
        method: 'POST',
        headers: {
          origin: 'https://app.example',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text: 123 }),
      }),
    )

    expect(response.status).toBe(400)
    expect(response.headers.get('access-control-allow-origin')).toBe(
      'https://app.example',
    )
  })

  it('preflightのmethod/header/max-ageを明示設定できる', async () => {
    const { application } = createFixture(
      validate.cors({
        origin: 'https://app.example',
        allowMethods: ['post', 'put'],
        allowHeaders: ['content-type', 'x-token'],
        maxAge: 600,
      }),
    )

    const response = await application.handle(
      new Request('http://fixture.test/cors', {
        method: 'OPTIONS',
        headers: {
          origin: 'https://app.example',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'x-other',
        },
      }),
    )

    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-methods')).toBe(
      'POST, PUT',
    )
    expect(response.headers.get('access-control-allow-headers')).toBe(
      'content-type, x-token',
    )
    expect(response.headers.get('access-control-max-age')).toBe('600')
    expect(response.headers.get('vary')).toContain('Origin')
  })

  it('許可していないoriginにはallow-originを返さない', async () => {
    const { application } = createFixture(
      validate.cors({ origin: 'https://allowed.example' }),
    )

    const response = await application.handle(
      new Request('http://fixture.test/cors', {
        method: 'POST',
        headers: { origin: 'https://denied.example' },
      }),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
    expect(response.headers.get('vary')).toBe('Accept, Origin')
  })

  it('origin predicateを非同期で評価できる', async () => {
    const { application } = createFixture(
      validate.cors({
        origin: async (origin) => origin.endsWith('.example'),
      }),
    )

    const response = await application.handle(
      new Request('http://fixture.test/cors', {
        method: 'POST',
        headers: { origin: 'https://app.example' },
      }),
    )

    expect(response.headers.get('access-control-allow-origin')).toBe(
      'https://app.example',
    )
  })

  it('credentialed CORSとwildcard originの組み合わせを拒否する', () => {
    expect(() => validate.cors({ credentials: true })).toThrow(TypeError)
    expect(() =>
      validate.cors({ origin: '*', credentials: true }),
    ).toThrow(TypeError)
  })
})

function createFixture(corsLayer: ReturnType<typeof validate.cors>) {
  let controllerExecutions = 0
  const Contract = contract({
    create: procedure({
      protocols: {
        http: http({
          method: 'POST',
          path: '/cors',
          responses: {
            created: {
              status: 200,
              body: z.object({ ok: z.boolean() }),
              staticHeaders: {
                vary: 'Accept',
                'x-request-id': 'request-1',
              },
            },
          },
          pipeline: [corsLayer, http.controller],
        }),
      },
    }),
  })
  const Implementation = implementation({
    name: 'CorsImplementation',
    contract: Contract,
    protocol: http,
    factory: () => ({
      create(ctx) {
        controllerExecutions += 1
        return ctx.response.created({ body: { ok: true } })
      },
    }),
  })
  const Module = defineModule(() => ({ implementations: [Implementation] }))
  return {
    application: createHttpApplication({
      modules: [Module()],
      logger: silentLogger,
    }),
    executions: () => controllerExecutions,
  }
}

function createValidationFixture(corsLayer: ReturnType<typeof validate.cors>) {
  const Contract = contract({
    create: procedure({
      protocols: {
        http: http({
          method: 'POST',
          path: '/cors-validation',
          request: {
            body: z.object({ text: z.string() }),
          },
          responses: {
            created: {
              status: 200,
              body: z.object({ ok: z.boolean() }),
            },
          },
          pipeline: [corsLayer, validate.body, http.controller],
        }),
      },
    }),
  })
  const Implementation = implementation({
    name: 'CorsValidationImplementation',
    contract: Contract,
    protocol: http,
    factory: () => ({
      create(ctx) {
        return ctx.response.created({ body: { ok: true } })
      },
    }),
  })
  const Module = defineModule(() => ({ implementations: [Implementation] }))
  return createHttpApplication({
    modules: [Module()],
    logger: silentLogger,
  })
}
