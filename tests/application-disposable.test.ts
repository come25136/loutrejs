import { createKernelApplication, defineApplication } from '@loutrejs/loutre'

describe('Application disposal', () => {
  it('await using delegates cleanup to the current close implementation', async () => {
    const application = createKernelApplication({
      application: defineApplication({ modules: [] }),
    })
    const close = application.close.bind(application)
    let closeCalls = 0

    Object.assign(application, {
      async close(signal?: string) {
        closeCalls += 1
        await close(signal)
      },
      async [Symbol.asyncDispose]() {
        closeCalls += 1
        await close()
      },
    })

    {
      await using app = application
      await app.init()
    }

    expect(closeCalls).toBe(1)
  })
})
