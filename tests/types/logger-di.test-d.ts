import {
  createKernelApplication,
  defineApplication,
  defineModule,
  provide,
  inject,
  LoggerToken,
  type OnApplicationDispose,
} from '@loutrejs/loutre'
import { Logger } from '@loutrejs/loutre/runtime'

class LoggerService extends Logger {}
const Logging = defineModule({
  providers: [provide(LoggerToken).useClass(LoggerService)],
  exports: [LoggerToken],
})
const definition = defineApplication({ modules: [Logging] })
const app = createKernelApplication({ application: definition })
const logger: Logger = app.get(LoggerToken)
const disposable: OnApplicationDispose = logger
void disposable

class Consumer {
  readonly logger: Logger = inject(LoggerToken)
}
void Consumer

// @ts-expect-error rootの選択はModule.providersで宣言する。
defineApplication({ modules: [], logger: LoggerService })
class Invalid {
  readonly value = 'message'
}
// @ts-expect-error Logger以外のクラスは予約tokenに登録できない。
provide(LoggerToken).useClass(Invalid)
// @ts-expect-error Modelを迂回する起動時のLogger差し替えは提供しない。
createKernelApplication({ application: definition, logger: new Logger() })
