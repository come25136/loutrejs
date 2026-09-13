import { instrumentSourceLocations } from '../packages/cli/src/source-instrumentation.js'

describe('CLI source instrumentation', () => {
  it('hashbangとdirective prologueを維持しhelper名衝突を回避する', () => {
    const source = `#!/usr/bin/env node
'use strict'
import { defineModule } from '@loutrejs/loutre'
const __loutreSource = 1
class RealService {}
const Module = defineModule(() => ({ providers: [RealService] }))
void __loutreSource
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
    expect(transformed).toContain('__loutreSource$1(RealService')
  })

  it('define系APIのcallsiteだけsource registrationする', () => {
    const source = `import { defineModule, provide, token } from '@loutrejs/loutre'
import { basicAuth, http } from '@loutrejs/loutre/http'
const VALUE = token('value')
const middleware = basicAuth({ name: 'auth' })
const Contract = http.contract({ get: { method: 'GET', path: '/', responses: { ok: { status: 200 } } } })
const Controller = http.implementation({ name: 'Controller', contract: Contract, factory: () => ({ get() {} }) })
const provider = provide(VALUE).useValue('value')
const Module = defineModule(() => ({ providers: [provider], executions: [Controller] }))
void middleware
void Module
`
    const transformed = instrumentSourceLocations(
      source,
      '/repo/src/app.ts',
      '/repo',
    )

    expect(transformed).toContain('const middleware = __loutreSource(basicAuth')
    expect(transformed).toContain(
      'const Contract = __loutreSource(http.contract',
    )
    expect(transformed).toContain(
      'const Controller = __loutreSource(http.implementation',
    )
    expect(transformed).toContain(
      'const provider = __loutreSource(provide(VALUE).useValue',
    )
    expect(transformed).toContain('const Module = __loutreSource(defineModule')
  })

  it('日本語と絵文字が前にあってもUTF-8 byte spanでcodeを壊さない', () => {
    const source = `import { defineModule } from '@loutrejs/loutre'
const marker = '日本語🦦'; const Module = defineModule(() => ({ name: 'App' }))
void marker
void Module
`
    const transformed = instrumentSourceLocations(
      source,
      '/repo/src/app.ts',
      '/repo',
    )

    expect(transformed).toContain(
      "const marker = '日本語🦦'; const Module = __loutreSource(defineModule",
    )
    expect(transformed).toContain('"file":"src/app.ts","line":2,"column":40')
    expect(transformed).toContain('void marker\nvoid Module')
  })

  it('aliasや未知callへgeneric source registrationを追加しない', () => {
    const source = `import { EventEmitter } from 'node:events'
import { defineModule } from '@loutrejs/loutre'
const ImportedAlias = EventEmitter
function externalClass() { return EventEmitter }
const CallAlias = externalClass()
const Module = defineModule(() => ({ providers: [ImportedAlias, CallAlias] }))
void Module
`
    const transformed = instrumentSourceLocations(
      source,
      '/repo/src/app.ts',
      '/repo',
    )

    expect(transformed).not.toContain('__loutreSource(ImportedAlias')
    expect(transformed).not.toContain('__loutreSource(CallAlias')
    expect(transformed).not.toContain('__loutreSource(externalClass()')
    expect(transformed).toContain('const Module = __loutreSource(defineModule')
  })

  it('import APIと同名の関数引数callはsource registrationしない', () => {
    const source = `import { argumentsProvider, defineModule, environmentProvider, provide } from '@loutrejs/loutre'
import { basicAuth, bearerAuth, cors, defineHttpContract, defineHttpImplementation, defineHttpMiddleware, http } from '@loutrejs/loutre/http'
const RealModule = defineModule(() => ({ name: 'Real' }))
function shadow(
  defineModule: any,
  provide: any,
  environmentProvider: any,
  argumentsProvider: any,
  http: any,
  defineHttpContract: any,
  defineHttpImplementation: any,
  defineHttpMiddleware: any,
  basicAuth: any,
  bearerAuth: any,
  cors: any,
) {
  defineModule()
  provide(null).useValue(null)
  environmentProvider()
  argumentsProvider()
  http.contract({})
  http.implementation({})
  http.middleware({})
  defineHttpContract({})
  defineHttpImplementation({})
  defineHttpMiddleware({})
  basicAuth({})
  bearerAuth({})
  cors({})
}
void RealModule
void shadow
`
    const transformed = instrumentSourceLocations(
      source,
      '/repo/src/app.ts',
      '/repo',
    )

    expect(transformed).toContain(
      'const RealModule = __loutreSource(defineModule',
    )
    expect(transformed.match(/__loutreSource\(/g)).toHaveLength(1)
  })

  it('import aliasもbinding identityで判定しshadowingを除外する', () => {
    const source = `import { defineModule as dm } from '@loutrejs/loutre'
const RealModule = dm(() => ({ name: 'Real' }))
function selectExternal(dm: () => unknown) {
  return dm()
}
void RealModule
void selectExternal
`
    const transformed = instrumentSourceLocations(
      source,
      '/repo/src/app.ts',
      '/repo',
    )

    expect(transformed).toContain('const RealModule = __loutreSource(dm')
    expect(transformed).toContain('return dm()')
    expect(transformed).not.toContain('return __loutreSource(dm()')
    expect(transformed.match(/__loutreSource\(/g)).toHaveLength(1)
  })

  it('type-only importはruntime API bindingとして扱わない', () => {
    const source = `import type { defineModule } from '@loutrejs/loutre'
void 0
`
    expect(instrumentSourceLocations(source, '/repo/src/app.ts', '/repo')).toBe(
      source,
    )
  })

  it('lexical bindingでshadowされたimport API callはsource registrationしない', () => {
    const source = `import { defineModule } from '@loutrejs/loutre'
import { defineHttpContract, defineHttpImplementation, defineHttpMiddleware, http } from '@loutrejs/loutre/http'
const RealModule = defineModule(() => ({ name: 'Real' }))
function varShadow() {
  defineModule()
  var defineModule = () => null
}
function destructured({ http }: any) {
  return http.contract({})
}
{
  defineHttpContract({})
  const defineHttpContract = () => null
}
try {
  throw null
} catch (defineHttpImplementation) {
  defineHttpImplementation({})
}
for (const defineHttpMiddleware of []) {
  defineHttpMiddleware({})
}
void RealModule
void varShadow
void destructured
`
    const transformed = instrumentSourceLocations(
      source,
      '/repo/src/app.ts',
      '/repo',
    )

    expect(transformed.match(/__loutreSource\(/g)).toHaveLength(1)
  })

  it('parameter initializerとstatic blockのvar scopeを区別する', () => {
    const source = `import { defineModule } from '@loutrejs/loutre'
function defaultParam(value = defineModule(() => ({ name: 'Param' }))) {
  var defineModule = () => null
  return value
}
class Holder {
  static {
    defineModule()
    var defineModule = () => null
  }
}
void defaultParam
void Holder
`
    const transformed = instrumentSourceLocations(
      source,
      '/repo/src/app.ts',
      '/repo',
    )

    expect(transformed).toContain('value = __loutreSource(defineModule(() =>')
    expect(transformed).not.toContain(
      'static {\n    __loutreSource(defineModule()',
    )
  })

  it('declare classとanonymous default classはruntime instrumentation対象にしない', () => {
    for (const source of [
      `declare class AmbientOnlyType {}\n`,
      `function dec(value: any) { return value }\n@dec\nexport default class {}\n`,
      `export default abstract class {}\n`,
    ]) {
      expect(
        instrumentSourceLocations(source, '/repo/src/service.ts', '/repo'),
      ).toBe(source)
    }
  })

  it('named class declarationはsource registrationする', () => {
    const source = `export class Service {}\n`
    const transformed = instrumentSourceLocations(
      source,
      '/repo/src/service.ts',
      '/repo',
    )
    expect(transformed).toContain('__loutreSource(Service')
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
})
