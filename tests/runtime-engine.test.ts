import { defineApplication } from '@loutrejs/loutre'
import { awsLambdaRuntime } from '@loutrejs/loutre/runtime/aws-lambda'
import { bunRuntime } from '@loutrejs/loutre/runtime/bun'
import { cloudflareWorkersRuntime } from '@loutrejs/loutre/runtime/cloudflare-workers'
import { denoRuntime } from '@loutrejs/loutre/runtime/deno'
import { electronRuntime } from '@loutrejs/loutre/runtime/electron'
import { nodeRuntime } from '@loutrejs/node'
import { UsersModule } from '../examples/http-crud/src/index.js'
import { EventsModule } from '../examples/streaming/src/index.js'
import { silentLogger } from './helpers/silent-logger.js'

const usersDefinition = () =>
  defineApplication({ modules: [UsersModule()], logger: silentLogger })
const eventsDefinition = () =>
  defineApplication({ modules: [EventsModule()], logger: silentLogger })

describe('Runtime engine', () => {
  const startupOutput = vi
    .spyOn(console, 'log')
    .mockImplementation(() => undefined)

  afterEach(() => {
    startupOutput.mockClear()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  afterAll(() => {
    startupOutput.mockRestore()
  })

  it('Bun上ではnodeRuntimeを拒否する', async () => {
    vi.stubGlobal('Bun', { version: '1.3.7' })

    await expect(
      nodeRuntime.serve({ application: usersDefinition() }),
    ).rejects.toThrow('LUTRE_RUNTIME_MISMATCH: Expected Node.js, detected Bun.')
    expect(startupOutput).not.toHaveBeenCalled()
  })

  it('Deno上ではnodeRuntimeを拒否する', async () => {
    vi.stubGlobal('Deno', { version: { deno: '2.9.5' } })

    await expect(
      nodeRuntime.serve({ application: usersDefinition() }),
    ).rejects.toThrow(
      'LUTRE_RUNTIME_MISMATCH: Expected Node.js, detected Deno.',
    )
    expect(startupOutput).not.toHaveBeenCalled()
  })

  it('Node.js上ではbunRuntimeを拒否する', async () => {
    await expect(
      bunRuntime.serve({ application: usersDefinition() }),
    ).rejects.toThrow('LUTRE_RUNTIME_MISMATCH: Expected Bun, detected Node.js.')
    expect(startupOutput).not.toHaveBeenCalled()
  })

  it('Node.js上ではdenoRuntimeを拒否する', () => {
    expect(() => denoRuntime.bind({ application: usersDefinition() })).toThrow(
      'LUTRE_RUNTIME_MISMATCH: Expected Deno, detected Node.js.',
    )
  })

  it('Node.js上ではcloudflareWorkersRuntimeを拒否する', () => {
    expect(() =>
      cloudflareWorkersRuntime.bind({ application: usersDefinition() }),
    ).toThrow(
      'LUTRE_RUNTIME_MISMATCH: Expected Cloudflare Workers, detected Node.js.',
    )
  })

  it('Node.js上ではawsLambdaRuntimeを拒否する', () => {
    expect(() =>
      awsLambdaRuntime.bind({ application: usersDefinition() }),
    ).toThrow('LUTRE_RUNTIME_MISMATCH: Expected AWS Lambda, detected Node.js.')
  })

  it('Node.js上ではelectronRuntimeを拒否する', () => {
    expect(() =>
      electronRuntime.attach({
        application: eventsDefinition(),
        port: {
          postMessage: () => undefined,
          on: () => undefined,
          start: () => undefined,
        },
      }),
    ).toThrow('LUTRE_RUNTIME_MISMATCH: Expected Electron, detected Node.js.')
  })
})
