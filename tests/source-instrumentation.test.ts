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

  it('日本語と絵文字が前にあってもOxc offsetでcodeを壊さない', () => {
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
