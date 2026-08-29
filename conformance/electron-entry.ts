import { app, MessageChannelMain } from 'electron'
import { electronRuntime } from '@loutrejs/loutre/runtime/electron'
import definition from '../dist/conformance/streaming-message-port/application.mjs'

async function main(): Promise<void> {
  await app.whenReady()
  const { port1, port2 } = new MessageChannelMain()
  const attachment = electronRuntime.attach({
    application: definition,
    port: port1,
  })
  try {
    const messages: unknown[] = []

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Electron MessagePort conformance timed out')),
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
        `Electron conformance failed: ${JSON.stringify(messages)}`,
      )
    }
    await attachment.close('conformance')
    port1.close()
    port2.close()
    console.log('Electron 43 MessagePort conformance: passed')
    app.exit(0)
  } catch (error) {
    await attachment.close('conformance').catch(() => undefined)
    port1.close()
    port2.close()
    console.error(error)
    app.exit(1)
  }
}

void main()
