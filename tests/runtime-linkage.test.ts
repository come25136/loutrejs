import {
  linkApplication,
  runtimeLinkageTarget,
} from '@loutrefw/runtime/internal'
import { Container, DependencyResolutionError } from '@loutrefw/runtime'

describe('Runtime Linkage Artifact', () => {
  it('Graph Manifestとfingerprintが異なるartifactを拒否する', () => {
    let linked = false
    const application = {
      [runtimeLinkageTarget]: () => {
        linked = true
      },
    }

    expect(() =>
      linkApplication(application, {
        graph: { version: 1, fingerprint: 'graph' },
        linkage: { version: 1, fingerprint: 'linkage', bindings: [] },
      }),
    ).toThrow(/fingerprint/)
    expect(linked).toBe(false)
  })

  it('同じApplicationへの二重linkを拒否する', () => {
    const container = new Container([])
    const artifact = { version: 1 as const, fingerprint: 'test', bindings: [] }
    container[runtimeLinkageTarget](artifact)
    expect(() => container[runtimeLinkageTarget](artifact)).toThrow(
      DependencyResolutionError,
    )
  })
})
