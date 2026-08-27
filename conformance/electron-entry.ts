import { app, MessageChannelMain } from 'electron'
import { assertValidCompilation, compileApplication } from '@loutrejs/graph'
import { createMessagePortExecution } from '@loutrejs/message-port'
import { ApplicationRuntime } from '@loutrejs/runtime'
import { attachElectronMessagePort } from '@loutrejs/runtime-electron'
import definition from '../dist/conformance/streaming-message-port/application.mjs'

async function main(): Promise<void> {
  await app.whenReady()
  try {
    const graph = assertValidCompilation(
      compileApplication({
        modules: definition.modules,
        entrypoint: definition.entrypoint,
        triggers: definition.triggers,
      }),
    )
    const runtime = new ApplicationRuntime(definition.modules, {
      environmentSource: process.env,
    })
    const application = createMessagePortExecution({ runtime, graph })
    const { port1, port2 } = new MessageChannelMain()
    attachElectronMessagePort(application, port1)
    const messages: unknown[] = []

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () =>
          reject(
            new Error('Electron MessagePort conformanceがtimeoutしました'),
          ),
        5_000,
      )
      port2.on('message', (event) => {
        messages.push(event.data)
        if (event.data?.done) {
          clearTimeout(timeout)
          resolve()
        }
      })
      port2.start()
      port2.postMessage({ id: 'electron-stream', procedure: 'subscribe' })
    })

    if (messages.length !== 4) {
      throw new Error(
        `Electron conformanceに失敗しました: ${JSON.stringify(messages)}`,
      )
    }
    await application.shutdown('conformance')
    port1.close()
    port2.close()
    console.log('Electron 43 MessagePort conformance: 成功')
    app.exit(0)
  } catch (error) {
    console.error(error)
    app.exit(1)
  }
}

void main()
