import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DEVTOOLS_PROTOCOL_VERSION,
  startDevtoolsServer,
  type DevtoolsGraphSnapshot,
} from '../packages/cli/src/devtools-server.js'

describe('Loutre Devtools API', () => {
  let projectRoot: string

  beforeEach(async () => {
    projectRoot = await mkdtemp(join(tmpdir(), 'loutre-devtools-api-'))
  })

  afterEach(async () => {
    await rm(projectRoot, { recursive: true, force: true })
  })

  function snapshot(label = 'AppModule'): DevtoolsGraphSnapshot {
    return {
      schemaVersion: DEVTOOLS_PROTOCOL_VERSION,
      nodes: [{ id: 'module:1', kind: 'module', label }],
      edges: [],
      diagnostics: [],
    }
  }

  it('許可した公式サイトへGraph Snapshotを公開する', async () => {
    const server = await startDevtoolsServer({
      projectRoot,
      entry: 'src/app.ts',
      port: 0,
      loadGraph: async () => snapshot(),
    })

    try {
      const response = await fetch(`${server.url}/api/graph`, {
        headers: { Origin: 'https://loutrejs.come25136.id' },
      })

      expect(response.status).toBe(200)
      expect(response.headers.get('access-control-allow-origin')).toBe(
        'https://loutrejs.come25136.id',
      )
      expect(response.headers.get('x-loutre-revision')).toBe('1')
      expect(await response.json()).toEqual(snapshot())
    } finally {
      await server.close()
    }
  })

  it('許可していないWeb originにはGraphを返さない', async () => {
    const server = await startDevtoolsServer({
      projectRoot,
      entry: 'src/app.ts',
      port: 0,
      loadGraph: async () => snapshot(),
    })

    try {
      const response = await fetch(`${server.url}/api/graph`, {
        headers: { Origin: 'https://example.com' },
      })

      expect(response.status).toBe(403)
      expect(response.headers.has('access-control-allow-origin')).toBe(false)
    } finally {
      await server.close()
    }
  })

  it('Private Network Accessのpreflightへ明示的に応答する', async () => {
    const server = await startDevtoolsServer({
      projectRoot,
      entry: 'src/app.ts',
      port: 0,
      loadGraph: async () => snapshot(),
    })

    try {
      const response = await fetch(`${server.url}/api/graph`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://loutrejs.come25136.id',
          'Access-Control-Request-Private-Network': 'true',
        },
      })

      expect(response.status).toBe(204)
      expect(response.headers.get('access-control-allow-private-network')).toBe(
        'true',
      )
    } finally {
      await server.close()
    }
  })

  it('再buildに失敗しても直前のSnapshotをerrorと一緒に保持する', async () => {
    let failure = false
    const server = await startDevtoolsServer({
      projectRoot,
      entry: 'src/app.ts',
      port: 0,
      loadGraph: async () => {
        if (failure) throw new Error('fixture build failed')
        return snapshot()
      },
    })

    try {
      failure = true
      const response = await fetch(`${server.url}/api/reload`, {
        method: 'POST',
        headers: { Origin: 'https://loutrejs.come25136.id' },
      })

      expect(response.status).toBe(503)
      expect(await response.json()).toEqual({
        error: 'fixture build failed',
        snapshot: snapshot(),
      })
    } finally {
      await server.close()
    }
  })

  it('projectのsource変更後にGraphを自動で再buildする', async () => {
    let builds = 0
    const server = await startDevtoolsServer({
      projectRoot,
      entry: 'src/app.ts',
      port: 0,
      loadGraph: async () => snapshot(`AppModule:${++builds}`),
    })

    try {
      await writeFile(join(projectRoot, 'source.ts'), 'export {}\n', 'utf8')

      await vi.waitFor(
        async () => {
          const response = await fetch(`${server.url}/api/graph`)
          expect(
            Number(response.headers.get('x-loutre-revision')),
          ).toBeGreaterThan(1)
          expect(builds).toBeGreaterThan(1)
        },
        { timeout: 3_000 },
      )
    } finally {
      await server.close()
    }
  })
})
