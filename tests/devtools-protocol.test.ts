import { readFileSync } from 'node:fs'
import { DEVTOOLS_PROTOCOL_VERSION } from '@loutrejs/loutre/devtools'

describe('DevTools protocol version', () => {
  it('CoreとBrowser clientのprotocol versionを同期する', () => {
    const source = readFileSync(
      new URL('../website/lib/devtools-protocol.ts', import.meta.url),
      'utf8',
    )
    expect(source).toContain(
      `export const DEVTOOLS_PROTOCOL_VERSION = ${DEVTOOLS_PROTOCOL_VERSION}`,
    )
  })
})
