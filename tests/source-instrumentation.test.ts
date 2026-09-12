import { instrumentSourceLocations } from '../packages/cli/src/source-instrumentation.js'

describe('CLI source instrumentation', () => {
  it('hashbangとdirective prologueを維持しhelper名衝突を回避する', () => {
    const source = `#!/usr/bin/env node
'use strict'
import { defineModule } from '@loutrejs/loutre'
const __loutreSource = 1
const __loutreMemberSource = 2
class RealService {}
const Module = defineModule(() => ({ providers: [RealService] }))
void __loutreSource
void __loutreMemberSource
void Module
`
    const transformed = instrumentSourceLocations(
      source,
      '/repo/src/app.ts',
      '/repo',
    )

    expect(transformed.startsWith('#!/usr/bin/env node\n')).toBe(true)
    expect(transformed.indexOf("'use strict'")).toBeLessThan(
      transformed.indexOf('registerSourceLocation as'),
    )
    expect(transformed).toContain('registerSourceLocation as __loutreSource$1')
    expect(transformed).toContain(
      'registerSourceMemberLocation as __loutreMemberSource$1',
    )
    expect(transformed).toContain('__loutreSource$1(RealService')
  })
  it('既知HTTP middleware factoryはローカル生成地点をsource registrationする', () => {
    const source = `import { basicAuth } from '@loutrejs/loutre/http'
const basicAuthentication = basicAuth({ name: 'basicAuthentication' })
void basicAuthentication
`
    const transformed = instrumentSourceLocations(
      source,
      '/repo/src/authentication.ts',
      '/repo',
    )

    expect(transformed).toContain(
      'const basicAuthentication = __loutreSource(basicAuth',
    )
    expect(transformed).toContain('"file":"src/authentication.ts"')
    expect(transformed).toContain('"line":2')
  })

  it('alias initializerへgeneric source registrationを追加しない', () => {
    const source = `import { EventEmitter } from 'node:events'
import * as events from 'node:events'
import { defineModule } from '@loutrejs/loutre'
const ImportedAlias = EventEmitter
const MemberAlias = events.EventEmitter
function externalClass() { return EventEmitter }
const CallAlias = externalClass()
const Module = defineModule(() => ({ providers: [ImportedAlias, CallAlias] }))
void MemberAlias
void Module
`
    const transformed = instrumentSourceLocations(
      source,
      '/repo/src/app.ts',
      '/repo',
    )

    expect(transformed).not.toContain('__loutreSource(ImportedAlias')
    expect(transformed).not.toContain('__loutreSource(MemberAlias')
    expect(transformed).not.toContain('__loutreSource(CallAlias')
    expect(transformed).not.toContain('__loutreSource(externalClass()')
    expect(transformed).toContain('const Module = __loutreSource(defineModule')
  })
  it('declare classはruntime source instrumentation対象にしない', () => {
    const source = `import { defineModule } from '@loutrejs/loutre'
declare class AmbientOnlyType {}
const Module = defineModule(() => ({ name: 'App' }))
void Module
`
    const transformed = instrumentSourceLocations(
      source,
      '/repo/src/app.ts',
      '/repo',
    )

    expect(transformed).not.toContain('__loutreSource(AmbientOnlyType')
    expect(transformed).toContain('const Module = __loutreSource(defineModule')
  })

  it('再代入可能factoryはhandler member sourceを推定しない', () => {
    const source = `import { http } from '@loutrejs/loutre/http'
const oldFactory = () => ({ create() {} })
const realFactory = () => ({ create() {} })
let factory = oldFactory
factory = realFactory
const Controller = http.implementation({ name: 'Controller', contract: {} as any, factory })
void Controller
`
    const transformed = instrumentSourceLocations(
      source,
      '/repo/src/app.ts',
      '/repo',
    )

    expect(transformed).not.toContain('__loutreMemberSource(Controller.factory')
  })

  it('一意な直接object returnならhandler member sourceを保持する', () => {
    const source = `import { http } from '@loutrejs/loutre/http'
const Controller = http.implementation({
  name: 'Controller',
  contract: {} as any,
  factory: () => {
    return { create() {} }
  },
})
void Controller
`
    const transformed = instrumentSourceLocations(
      source,
      '/repo/src/app.ts',
      '/repo',
    )

    expect(transformed).toContain('__loutreMemberSource(Controller.factory')
  })

  it('複数returnを持つfactoryはhandler member sourceを推定しない', () => {
    const source = `import { http } from '@loutrejs/loutre/http'
const useFirst = true
const Controller = http.implementation({
  name: 'Controller',
  contract: {} as any,
  factory: () => {
    if (useFirst) return { create() {} }
    return { create() {} }
  },
})
void Controller
`
    const transformed = instrumentSourceLocations(
      source,
      '/repo/src/app.ts',
      '/repo',
    )

    expect(transformed).not.toContain('__loutreMemberSource(Controller.factory')
  })

  it('変数化したimplementation objectはhandler member sourceを推定しない', () => {
    const source = `import { http } from '@loutrejs/loutre/http'
const oldFactory = () => ({ create() {} })
const realFactory = () => ({ create() {} })
const implementation = { name: 'Controller', contract: {} as any, factory: oldFactory }
implementation.factory = realFactory
const Controller = http.implementation(implementation)
void Controller
`
    const transformed = instrumentSourceLocations(
      source,
      '/repo/src/app.ts',
      '/repo',
    )

    expect(transformed).not.toContain('__loutreMemberSource(Controller.factory')
  })

  it('spreadまたはcomputed propertyを含むhandler objectはmember sourceを推定しない', () => {
    const source = `import { http } from '@loutrejs/loutre/http'
const actual = { create() {} }
const dynamicKey = 'create'
const SpreadController = http.implementation({
  name: 'SpreadController',
  contract: {} as any,
  factory: () => ({ create() {}, ...actual }),
})
const ComputedController = http.implementation({
  name: 'ComputedController',
  contract: {} as any,
  factory: () => ({ create() {}, [dynamicKey]() {} }),
})
void SpreadController
void ComputedController
`
    const transformed = instrumentSourceLocations(
      source,
      '/repo/src/app.ts',
      '/repo',
    )

    expect(transformed).not.toContain(
      '__loutreMemberSource(SpreadController.factory',
    )
    expect(transformed).not.toContain(
      '__loutreMemberSource(ComputedController.factory',
    )
  })

  it('Windows drive形式のproject-relative結果はinstrumentation対象外にする', () => {
    const source = `import { defineModule } from '@loutrejs/loutre'
const Module = defineModule(() => ({ name: 'App' }))
void Module
`
    expect(
      instrumentSourceLocations(source, '/repo/D:\\external\\app.ts', '/repo'),
    ).toBe(source)
  })

  it('namespace importとconst provider builder bindingを認識する', () => {
    const source = `import * as loutre from '@loutrejs/loutre'
import * as httpApi from '@loutrejs/loutre/http'
const TOKEN = loutre.token('value')
const builder = loutre.provide(TOKEN)
const provider = builder.useValue('value')
const middleware = httpApi.defineHttpMiddleware({ name: 'audit', factory: () => async (_ctx, next) => next() })
const Contract = httpApi.defineHttpContract({ get: { method: 'GET', path: '/', middlewares: [middleware], responses: { ok: { status: 200 } } } })
const Controller = httpApi.defineHttpImplementation({ name: 'Controller', contract: Contract, factory: () => ({ get() {} }) })
const Module = loutre.defineModule(() => ({ providers: [provider], executions: [Controller] }))
void Module
`
    const transformed = instrumentSourceLocations(
      source,
      '/repo/src/app.ts',
      '/repo',
    )

    expect(transformed).toContain(
      'const provider = __loutreSource(builder.useValue',
    )
    expect(transformed).toContain(
      'const middleware = __loutreSource(httpApi.defineHttpMiddleware',
    )
    expect(transformed).toContain(
      'const Contract = __loutreSource(httpApi.defineHttpContract',
    )
    expect(transformed).toContain(
      'const Controller = __loutreSource(httpApi.defineHttpImplementation',
    )
    expect(transformed).toContain(
      'const Module = __loutreSource(loutre.defineModule',
    )
  })
})
