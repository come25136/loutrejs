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
  it('alias initializerへgeneric source registrationを追加しない', () => {
    const source = `import { EventEmitter } from 'node:events'
import * as events from 'node:events'
import { defineModule } from '@loutrejs/loutre'
const ImportedAlias = EventEmitter
const MemberAlias = events.EventEmitter
const Module = defineModule(() => ({ providers: [ImportedAlias] }))
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
    expect(transformed).toContain('const Module = __loutreSource(defineModule')
  })
})
