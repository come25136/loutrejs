import { MessageChannel } from 'node:worker_threads'
import { attachMessagePort } from '@loutrefw/message-port'
import { createLinkedEventsMessagePortApplication } from './helpers/linked-applications.js'

describe('canonical Fixture D MessagePort/Electron', () => {
  it('同じdomain streamをMessagePortの複数messageへadaptする', async () => {
    const application = createLinkedEventsMessagePortApplication()
    const channel = new MessageChannel()
    attachMessagePort(application, channel.port1)
    const messages: unknown[] = []

    const completed = new Promise<void>((resolve) => {
      channel.port2.on('message', (message) => {
        messages.push(message)
        if (message.done) resolve()
      })
    })
    channel.port2.postMessage({ id: 'stream-1', procedure: 'subscribe' })
    await completed

    expect(messages).toEqual([
      {
        id: 'stream-1',
        variant: 'events',
        value: { sequence: 1, message: 'event-1' },
        done: false,
      },
      {
        id: 'stream-1',
        variant: 'events',
        value: { sequence: 2, message: 'event-2' },
        done: false,
      },
      {
        id: 'stream-1',
        variant: 'events',
        value: { sequence: 3, message: 'event-3' },
        done: false,
      },
      { id: 'stream-1', variant: 'events', done: true },
    ])

    channel.port1.close()
    channel.port2.close()
    await application.shutdown('test')
  })
})
