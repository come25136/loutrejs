import {
  runWorkspaceCommand,
  startWorkspace,
  waitForOutput,
  waitForPort,
} from './helpers/example-process.js'
import { reserveHttpPort } from './helpers/http-server.js'

const defineBasicAuthWorkspace = '@loutrejs/example-basic-auth'
const defineBearerAuthWorkspace = '@loutrejs/example-bearer-auth'
const corsWorkspace = '@loutrejs/example-cors'
const contentTypeUnionWorkspace = '@loutrejs/example-content-type-union'
const databaseTransactionsWorkspace = '@loutrejs/example-database-transactions'
const databasePostgresWorkspace = '@loutrejs/example-database-postgres'
const databaseDrizzleWorkspace = '@loutrejs/example-database-drizzle-postgres'
const databasePrismaWorkspace = '@loutrejs/example-database-prisma-postgres'
const helloCliWorkspace = '@loutrejs/example-hello-cli'
const helloHttpWorkspace = '@loutrejs/example-hello-http'
const nestedContractAuthWorkspace = '@loutrejs/example-nested-contract-auth'
const helloWorkerWorkspace = '@loutrejs/example-hello-worker'

describe.sequential('example projects', () => {
  it('Hello HTTP projectをstartして外部HTTP requestへ応答する', async () => {
    const port = await reserveHttpPort()
    const example = startWorkspace(helloHttpWorkspace, 'start', {
      PORT: String(port),
    })
    try {
      await waitForPort(port)
      const response = await fetch(`http://127.0.0.1:${port}/Loutre`)
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ message: 'Hello, Loutre!' })

      const invalid = await fetch(`http://127.0.0.1:${port}/x`)
      expect(invalid.status).toBe(400)
    } finally {
      await example.stop()
    }
  })

  it('Content-Type union projectでrepresentationごとのheader要件を検証する', async () => {
    const port = await reserveHttpPort()
    const example = startWorkspace(contentTypeUnionWorkspace, 'start', {
      PORT: String(port),
    })
    try {
      await waitForPort(port)

      const jsonResponse = await fetch(`http://127.0.0.1:${port}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: 'json' }),
      })
      expect(jsonResponse.status).toBe(200)
      expect(await jsonResponse.json()).toEqual({
        mediaType: 'application/json',
        message: 'json',
        customHeader: null,
      })

      const textResponse = await fetch(`http://127.0.0.1:${port}/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'text/plain',
          'x-custom-header': 'e2e',
        },
        body: 'text',
      })
      expect(textResponse.status).toBe(200)
      expect(await textResponse.json()).toEqual({
        mediaType: 'text/plain',
        message: 'text',
        customHeader: 'e2e',
      })

      const invalid = await fetch(`http://127.0.0.1:${port}/messages`, {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: 'missing header',
      })
      expect(invalid.status).toBe(400)
    } finally {
      await example.stop()
    }
  })

  it('Nested Contract Auth projectで親branchの認証Contextを子Controllerへ継承する', async () => {
    const checked = runWorkspaceCommand(nestedContractAuthWorkspace, 'check')
    expect(checked.status, checked.stderr || checked.stdout).toBe(0)

    const port = await reserveHttpPort()
    const example = startWorkspace(nestedContractAuthWorkspace, 'start', {
      PORT: String(port),
    })
    try {
      await waitForPort(port)
      const unauthorized = await fetch(
        `http://127.0.0.1:${port}/api/me/profile`,
      )
      expect(unauthorized.status).toBe(401)

      const authorized = await fetch(
        `http://127.0.0.1:${port}/api/me/profile`,
        {
          headers: {
            authorization: `Basic ${Buffer.from('loutre:otter').toString('base64')}`,
          },
        },
      )
      expect(authorized.status).toBe(200)
      expect(await authorized.json()).toEqual({
        id: 'user-1',
        name: 'Loutre User',
      })
    } finally {
      await example.stop()
    }
  })

  it('Basic Auth projectをstartして認証境界を処理する', async () => {
    const port = await reserveHttpPort()
    const example = startWorkspace(defineBasicAuthWorkspace, 'start', {
      PORT: String(port),
    })
    try {
      await waitForPort(port)
      const unauthorized = await fetch(`http://127.0.0.1:${port}/profile`)
      expect(unauthorized.status).toBe(401)
      expect(unauthorized.headers.get('www-authenticate')).toContain('Basic')

      const authorized = await fetch(`http://127.0.0.1:${port}/profile`, {
        headers: {
          authorization: `Basic ${Buffer.from('loutre:otter').toString('base64')}`,
        },
      })
      expect(authorized.status).toBe(200)
      expect(await authorized.json()).toEqual({
        id: 'user-1',
        name: 'Loutre User',
      })
    } finally {
      await example.stop()
    }
  })

  it('Bearer Auth projectをstartして認証境界を処理する', async () => {
    const port = await reserveHttpPort()
    const example = startWorkspace(defineBearerAuthWorkspace, 'start', {
      PORT: String(port),
    })
    try {
      await waitForPort(port)
      const unauthorized = await fetch(`http://127.0.0.1:${port}/profile`)
      expect(unauthorized.status).toBe(401)

      const authorized = await fetch(`http://127.0.0.1:${port}/profile`, {
        headers: { authorization: 'Bearer loutre-token' },
      })
      expect(authorized.status).toBe(200)
      expect(await authorized.json()).toEqual({
        id: 'user-1',
        name: 'Loutre User',
      })
    } finally {
      await example.stop()
    }
  })

  it('CORS projectをstartしてpreflightとactual requestを処理する', async () => {
    const port = await reserveHttpPort()
    const example = startWorkspace(corsWorkspace, 'start', {
      PORT: String(port),
    })
    try {
      await waitForPort(port)
      const preflight = await fetch(`http://127.0.0.1:${port}/messages`, {
        method: 'OPTIONS',
        headers: {
          origin: 'http://localhost:5173',
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type',
        },
      })
      expect(preflight.status).toBe(204)
      expect(preflight.headers.get('access-control-allow-origin')).toBe(
        'http://localhost:5173',
      )

      const response = await fetch(`http://127.0.0.1:${port}/messages`, {
        method: 'POST',
        headers: {
          origin: 'http://localhost:5173',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ text: 'Hello from E2E' }),
      })
      expect(response.status).toBe(201)
      expect(response.headers.get('access-control-allow-origin')).toBe(
        'http://localhost:5173',
      )
      expect(response.headers.get('x-request-id')).toBe('cors-example')
      expect(await response.json()).toMatchObject({ text: 'Hello from E2E' })
    } finally {
      await example.stop()
    }
  })

  it('in-memory transaction projectをstartしてrequestをcommitする', async () => {
    const port = await reserveHttpPort()
    const example = startWorkspace(databaseTransactionsWorkspace, 'start', {
      PORT: String(port),
    })
    try {
      await waitForPort(port)
      const response = await createUser(port)
      expect(response.status).toBe(201)
      expect(await response.json()).toMatchObject({
        name: 'Loutre',
        createdBy: 'demo-user',
      })
    } finally {
      await example.stop()
    }
  })

  it('PostgreSQL projectをDBごと起動してrequestをcommitする', async () => {
    await withDatabaseExample({
      workspace: databasePostgresWorkspace,
      databaseName: 'loutre',
      databaseUrlEnvironment: 'DATABASE_URL',
      createdBy: 'postgres-example',
    })
  })

  it('Drizzle projectをDBごと起動してrequestをcommitする', async () => {
    await withDatabaseExample({
      workspace: databaseDrizzleWorkspace,
      databaseName: 'loutre_drizzle',
      databaseUrlEnvironment: 'DRIZZLE_DATABASE_URL',
      createdBy: 'drizzle-example',
    })
  })

  it('Prisma projectをgenerateとDB起動から実行してrequestをcommitする', async () => {
    const generated = runWorkspaceCommand(databasePrismaWorkspace, 'generate')
    expect(generated.status, generated.stderr || generated.stdout).toBe(0)
    await withDatabaseExample({
      workspace: databasePrismaWorkspace,
      databaseName: 'loutre_prisma',
      databaseUrlEnvironment: 'PRISMA_DATABASE_URL',
      createdBy: 'prisma-example',
    })
  })

  it('CLI projectをstartして実引数をTaskへ渡す', () => {
    const result = runWorkspaceCommand(helloCliWorkspace, 'start', [
      '--name',
      'Loutre',
    ])
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('Hello, Loutre!')
  })

  it('Worker projectをstartしてTriggerを実行する', async () => {
    const example = startWorkspace(helloWorkerWorkspace)
    try {
      await waitForOutput(example, 'Hello from worker!')
    } finally {
      await example.stop()
    }
  })
})

async function withDatabaseExample({
  workspace,
  databaseName,
  databaseUrlEnvironment,
  createdBy,
}: {
  readonly workspace: string
  readonly databaseName: string
  readonly databaseUrlEnvironment: string
  readonly createdBy: string
}) {
  const port = await reserveHttpPort()
  const databasePort = await reserveHttpPort()
  const dockerEnvironment = { POSTGRES_PORT: String(databasePort) }
  const started = runWorkspaceCommand(
    workspace,
    'db:start',
    [],
    dockerEnvironment,
  )
  expect(started.status, started.stderr || started.stdout).toBe(0)

  const example = startWorkspace(workspace, 'start', {
    PORT: String(port),
    [databaseUrlEnvironment]: `postgres://loutre:loutre@127.0.0.1:${databasePort}/${databaseName}`,
  })
  try {
    await waitForPort(port, 30_000)
    const response = await createUser(port)
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ name: 'Loutre', createdBy })
  } finally {
    await example.stop()
    const stopped = runWorkspaceCommand(
      workspace,
      'db:stop',
      [],
      dockerEnvironment,
    )
    expect(stopped.status, stopped.stderr || stopped.stdout).toBe(0)
  }
}

function createUser(port: number) {
  return fetch(`http://127.0.0.1:${port}/users`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Loutre' }),
  })
}
