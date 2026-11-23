import { createKernelApplication, application } from '@loutrejs/loutre'

describe('Application disposal', () => {
  it('await using delegates cleanup to the current close implementation', async () => {
    const app = createKernelApplication({
      application: application({ modules: [] }),
    })
    const close = app.close.bind(app)
    let closeCalls = 0

    Object.assign(app, {
      async close(signal?: string) {
        closeCalls += 1
        await close(signal)
      },
    })

    {
      await using scopedApp = app
      await scopedApp.init()
    }

    expect(closeCalls).toBe(1)
  })
})
