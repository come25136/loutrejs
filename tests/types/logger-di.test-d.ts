import {
  createKernelApplication,
  defineApplication,
  defineModule,
  provide,
  inject,
  LoggerModule,
  LoggerService,
  LoggerToken,
  type OnApplicationDispose,
} from '@loutrejs/loutre'
import { Logger } from '@loutrejs/loutre/runtime'

class CustomLoggerService extends LoggerService {}
const Logging = defineModule({
  providers: [provide(LoggerToken).useClass(CustomLoggerService)],
  exports: [LoggerToken],
})
const definition = defineApplication({ modules: [Logging] })
const app = createKernelApplication({ application: definition })
const logger: LoggerService = app.get(LoggerToken)
const legacyLogger: Logger = logger
void legacyLogger
defineApplication({ modules: [LoggerModule] })
provide(LoggerToken).useClass(LoggerService)
const disposable: OnApplicationDispose = logger
void disposable

class Consumer {
  readonly logger: LoggerService = inject(LoggerToken)
}
void Consumer

// @ts-expect-error Loggerはchild APIを提供しない。
logger.child({ source: 'Consumer' })

// @ts-expect-error rootの選択はModule.providersで宣言する。
defineApplication({ modules: [], logger: LoggerService })
class Invalid {
  readonly value = 'message'
}
// @ts-expect-error Logger以外のクラスは予約tokenに登録できない。
provide(LoggerToken).useClass(Invalid)
// @ts-expect-error Modelを迂回する起動時のLogger差し替えは提供しない。
createKernelApplication({ application: definition, logger: new Logger() })
