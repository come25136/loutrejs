import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

interface LspPosition {
  readonly line: number
  readonly character: number
}

interface LspRange {
  readonly start: LspPosition
  readonly end: LspPosition
}

interface LspLocationLink {
  readonly targetUri: string
  readonly targetSelectionRange: LspRange
}

interface JsonRpcResponse {
  readonly id: number
  readonly result?: unknown
  readonly error?: unknown
}

class TypeScriptLspClient {
  readonly #process: ChildProcessWithoutNullStreams
  readonly #pending = new Map<
    number,
    {
      readonly resolve: (value: unknown) => void
      readonly reject: (error: Error) => void
    }
  >()
  #nextId = 1
  #buffer = Buffer.alloc(0)

  constructor(repository: string) {
    this.#process = spawn(
      process.execPath,
      [
        resolvePath(repository, 'node_modules/typescript/bin/tsc'),
        '--lsp',
        '--stdio',
      ],
      { cwd: repository },
    )

    this.#process.stdout.on('data', (chunk: Buffer) => this.#read(chunk))
    this.#process.stderr.resume()
    this.#process.on('exit', (code) => {
      if (code === 0 || this.#pending.size === 0) return
      const error = new Error(`TypeScript LSP exited with code ${String(code)}`)
      for (const { reject } of this.#pending.values()) reject(error)
      this.#pending.clear()
    })
  }

  async initialize(repository: string): Promise<void> {
    await this.request('initialize', {
      processId: process.pid,
      rootUri: pathToFileURL(repository).href,
      capabilities: {
        textDocument: {
          definition: { linkSupport: true },
        },
      },
    })
    this.notify('initialized', {})
  }

  open(file: string, text: string): void {
    this.notify('textDocument/didOpen', {
      textDocument: {
        uri: pathToFileURL(file).href,
        languageId: 'typescript',
        version: 1,
        text,
      },
    })
  }

  async request(method: string, params?: unknown): Promise<unknown> {
    const id = this.#nextId++
    const response = new Promise<unknown>((resolve, reject) => {
      this.#pending.set(id, { resolve, reject })
    })
    this.#write({
      jsonrpc: '2.0',
      id,
      method,
      ...(params === undefined ? {} : { params }),
    })
    return response
  }

  notify(method: string, params: unknown): void {
    this.#write({ jsonrpc: '2.0', method, params })
  }

  async close(): Promise<void> {
    if (this.#process.exitCode !== null) return
    try {
      await this.request('shutdown')
      this.notify('exit', {})
      this.#process.stdin.end()
      await new Promise<void>((resolve) =>
        this.#process.once('exit', () => resolve()),
      )
    } finally {
      if (this.#process.exitCode === null) this.#process.kill()
    }
  }

  #write(message: unknown): void {
    const body = Buffer.from(JSON.stringify(message))
    this.#process.stdin.write(`Content-Length: ${body.length}\r\n\r\n`)
    this.#process.stdin.write(body)
  }

  #read(chunk: Buffer): void {
    this.#buffer = Buffer.concat([this.#buffer, chunk])
    while (true) {
      const separator = this.#buffer.indexOf('\r\n\r\n')
      if (separator < 0) return
      const header = this.#buffer.subarray(0, separator).toString()
      const contentLength = /Content-Length:\s*(\d+)/i.exec(header)
      if (!contentLength) throw new Error(`Invalid LSP header: ${header}`)
      const length = Number(contentLength[1])
      const bodyStart = separator + 4
      if (this.#buffer.length < bodyStart + length) return

      const message = JSON.parse(
        this.#buffer.subarray(bodyStart, bodyStart + length).toString(),
      ) as Record<string, unknown>
      this.#buffer = this.#buffer.subarray(bodyStart + length)
      this.#handle(message)
    }
  }

  #handle(message: Record<string, unknown>): void {
    const hasRequestId =
      typeof message.id === 'number' || typeof message.id === 'string'
    if (hasRequestId && typeof message.method === 'string') {
      this.#write({ jsonrpc: '2.0', id: message.id, result: null })
      return
    }
    if (typeof message.id !== 'number') return

    const response = message as unknown as JsonRpcResponse
    const pending = this.#pending.get(response.id)
    if (!pending) return
    this.#pending.delete(response.id)
    if (response.error !== undefined) {
      pending.reject(new Error(JSON.stringify(response.error)))
    } else {
      pending.resolve(response.result)
    }
  }
}

const repository = resolvePath(import.meta.dirname, '..')
const controller = resolvePath(
  repository,
  'examples/hello-http/src/hello/controller.ts',
)
const contract = resolvePath(
  repository,
  'examples/hello-http/src/hello/contract.ts',
)

function positionOf(text: string, offset: number): LspPosition {
  const before = text.slice(0, offset).split('\n')
  return {
    line: before.length - 1,
    character: before.at(-1)!.length,
  }
}

function textAtRange(text: string, range: LspRange): string {
  const lines = text.split('\n')
  if (range.start.line !== range.end.line) {
    throw new Error('Expected a single-line definition selection')
  }
  return lines[range.start.line]!.slice(
    range.start.character,
    range.end.character,
  )
}

describe('editor navigation', () => {
  it('ctx.response.okからContractのresponses.okへGo to Definitionできる', async () => {
    const controllerText = readFileSync(controller, 'utf8')
    const contractText = readFileSync(contract, 'utf8')
    const expression = 'ctx.response.ok'
    const expressionOffset = controllerText.indexOf(expression)
    expect(expressionOffset).toBeGreaterThanOrEqual(0)
    const okOffset = expressionOffset + 'ctx.response.'.length

    const lsp = new TypeScriptLspClient(repository)
    try {
      await lsp.initialize(repository)
      lsp.open(controller, controllerText)

      const result = (await lsp.request('textDocument/definition', {
        textDocument: { uri: pathToFileURL(controller).href },
        position: positionOf(controllerText, okOffset),
      })) as readonly LspLocationLink[] | null

      expect(result).toHaveLength(1)
      const definition = result![0]!
      expect(fileURLToPath(definition.targetUri)).toBe(contract)
      expect(textAtRange(contractText, definition.targetSelectionRange)).toBe(
        'ok',
      )
    } finally {
      await lsp.close()
    }
  }, 15_000)
})
