import { createKernelApplication, application } from '@loutrejs/loutre'

const app = createKernelApplication({
  application: application({ modules: [] }),
})
const disposable: AsyncDisposable = app

void disposable
void app[Symbol.asyncDispose]()
