import { createKernelApplication, defineApplication } from '@loutrejs/loutre'

const application = createKernelApplication({
  application: defineApplication({ modules: [] }),
})
const disposable: AsyncDisposable = application

void disposable
void application[Symbol.asyncDispose]()
