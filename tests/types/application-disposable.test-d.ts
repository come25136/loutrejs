import { defineApplication } from '@loutrejs/loutre'
import { bootstrap } from '@loutrejs/loutre/host'

const application = bootstrap({
  application: defineApplication({ modules: [] }),
})
const disposable: AsyncDisposable = application

void disposable
void application[Symbol.asyncDispose]()
