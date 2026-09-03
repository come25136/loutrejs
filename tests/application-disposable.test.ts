import { defineApplication } from '@loutrejs/loutre'
import { bootstrap } from '@loutrejs/loutre/host'

describe('Application disposal', () => {
  it('await using delegates cleanup to the current close defineImplementation', async () => {
    const application = bootstrap({
      application: defineApplication({ modules: [] }),
    })
    const close = application.close.bind(application)
    let closeCalls = 0

    Object.assign(application, {
      async close(signal?: string) {
        closeCalls += 1
        await close(signal)
      },
    })

    {
      await using app = application
      await app.init()
    }

    expect(closeCalls).toBe(1)
  })
})
