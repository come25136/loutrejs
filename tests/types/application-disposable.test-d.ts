import {
  createKernelApplication,
  application as createApplication,
} from '@loutrejs/loutre'

const application = createKernelApplication({
  application: createApplication({ modules: [] }),
})
const disposable: AsyncDisposable = application

void disposable
void application[Symbol.asyncDispose]()
