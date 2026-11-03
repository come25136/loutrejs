import {
  createKernelApplication,
  defineApplication,
  defineModule,
  provide,
  token,
  type OnApplicationDispose,
} from '@loutrejs/loutre'
import { Logger } from '@loutrejs/loutre/runtime'

const ROOT = token<Logger>('application.logger')
const Logging = defineModule({
  providers: [provide(ROOT).useFactory({ use: () => new Logger() })],
  exports: [ROOT],
})
const definition = defineApplication({ modules: [Logging], logger: ROOT })
const app = createKernelApplication({ application: definition })
const logger: Logger = app.get(Logger)
const disposable: OnApplicationDispose = logger
void disposable

// @ts-expect-error Loggerの実体ではなくProviderのtokenを指定する。
defineApplication({ modules: [], logger: new Logger() })
// @ts-expect-error Logger以外を返すProviderは選択できない。
defineApplication({ modules: [], logger: token<string>('message') })
// @ts-expect-error Modelを迂回する起動時のLogger差し替えは提供しない。
createKernelApplication({ application: definition, logger: new Logger() })
