import { basename, relative } from 'node:path'
import { watch, type FSWatcher } from 'chokidar'
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import type { Duplex } from 'node:stream'
import {
  attachApplicationChannel,
  DEVTOOLS_APPLICATION_CHANNEL_PATH,
} from './application-channel.js'
import {
  attachDevtoolsClientChannel,
  DEVTOOLS_CLIENT_CHANNEL_PATH,
} from './client-channel.js'
import {
  DevtoolsControlPlane,
  type DevtoolsControlGraphState,
} from './control-plane.js'
import { DevtoolsEventStore } from './event-store.js'
import { DEVTOOLS_PROTOCOL_VERSION } from './protocol.js'
import { DevtoolsGraphSnapshotStore } from './snapshot-store.js'
import { isDevtoolsLoopbackRequest } from './security.js'

export { DEVTOOLS_PROTOCOL_VERSION } from './protocol.js'
export const DEFAULT_DEVTOOLS_PORT = 25136
export const DEFAULT_DEVTOOLS_ORIGINS = [
  'https://loutrejs.come25136.id',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3100',
  'http://127.0.0.1:3100',
] as const

export interface DevtoolsGraphSnapshot {
  readonly schemaVersion: typeof DEVTOOLS_PROTOCOL_VERSION
  readonly nodes: readonly unknown[]
  readonly edges: readonly unknown[]
  readonly diagnostics: readonly unknown[]
}

export interface DevtoolsGraphLoadResult {
  readonly snapshot: DevtoolsGraphSnapshot
  readonly watchFiles?: readonly string[]
}

export interface StartDevServerOptions {
  readonly projectRoot: string
  readonly entry: string
  readonly port?: number
  readonly origins?: readonly string[]
  readonly ignore?: readonly string[]
  readonly loadGraph: () => Promise<
    DevtoolsGraphSnapshot | DevtoolsGraphLoadResult
  >
  readonly maxEvents?: number
  readonly onSourceGraphReload?: () => void
}

export interface DevServer {
  readonly hostname: '127.0.0.1'
  readonly port: number
  readonly url: string
  readonly clientEndpoint: string
  readonly applicationEndpoint: string
  close(): Promise<void>
}

interface GraphState extends DevtoolsControlGraphState {
  readonly snapshot?: DevtoolsGraphSnapshot
}

const ignoredPathSegments = new Set([
  '.git',
  '.loutre',
  '.next',
  'coverage',
  'dist',
  'node_modules',
])

function rejectUnknownUpgrade(request: IncomingMessage, socket: Duplex): void {
  let pathname: string
  try {
    pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
  } catch {
    socket.destroy()
    return
  }
  if (
    pathname === DEVTOOLS_CLIENT_CHANNEL_PATH ||
    pathname === DEVTOOLS_APPLICATION_CHANNEL_PATH
  ) {
    return
  }
  socket.destroy()
}

export async function startDevServer(
  options: StartDevServerOptions,
): Promise<DevServer> {
  const origins = new Set(options.origins ?? DEFAULT_DEVTOOLS_ORIGINS)
  let state: GraphState = { revision: 0 }
  let reloadRequested = false
  let reloadPromise: Promise<void> | undefined
  let reloadTimer: ReturnType<typeof setTimeout> | undefined
  let watcher: FSWatcher | undefined
  let watchedPaths: readonly string[] | undefined
  let controlPlane: DevtoolsControlPlane | undefined
  const eventStore = new DevtoolsEventStore(options.maxEvents)
  const snapshotStore = new DevtoolsGraphSnapshotStore(options.projectRoot)

  const reload = (): Promise<void> => {
    reloadRequested = true
    reloadPromise ??= (async () => {
      while (reloadRequested) {
        reloadRequested = false
        try {
          const loaded = normalizeGraphLoadResult(await options.loadGraph())
          state = {
            revision: state.revision + 1,
            snapshot: loaded.snapshot,
          }
          if (loaded.watchFiles !== undefined) {
            watchedPaths = projectWatchFiles(
              options.projectRoot,
              loaded.watchFiles,
              options.ignore ?? [],
            )
          }
        } catch (error) {
          // A failed build may reference a file that does not exist yet and
          // therefore cannot appear in the last successful dependency list.
          // Temporarily widen reload triggers to the project until a build
          // succeeds and gives us a fresh dependency-aware watch set.
          watchedPaths = undefined
          state = {
            revision: state.revision + 1,
            ...(state.snapshot === undefined
              ? {}
              : { snapshot: state.snapshot }),
            error: error instanceof Error ? error.message : String(error),
          }
        }
        controlPlane?.publishGraphState()
      }
    })().finally(() => {
      reloadPromise = undefined
    })
    return reloadPromise
  }

  await reload()

  const server = createServer((request, response) => {
    handleHttpRequest(request, response, options.projectRoot, options.entry)
  })

  const applicationChannel = attachApplicationChannel(server, { eventStore })

  controlPlane = new DevtoolsControlPlane({
    graphState: () => state,
    reload,
    snapshotStore,
    eventStore,
    command: (runId, command) => applicationChannel.command(runId, command),
  })
  const clientChannel = attachDevtoolsClientChannel(server, {
    origins,
    controlPlane,
  })
  server.on('upgrade', rejectUnknownUpgrade)

  try {
    watcher = watch(options.projectRoot, {
      ignoreInitial: true,
      followSymlinks: false,
      ignored: createWatchIgnore(options.projectRoot, options.ignore ?? []),
    })
    watcher.on('all', (_event, path) => {
      if (!shouldReloadPath(options.projectRoot, watchedPaths, path)) return
      if (reloadTimer) clearTimeout(reloadTimer)
      reloadTimer = setTimeout(() => {
        void reload().then(() => {
          if (state.error !== undefined) return
          options.onSourceGraphReload?.()
        })
      }, 150)
    })
    watcher.on('error', (error) => {
      state = {
        ...state,
        revision: state.revision + 1,
        error: `File watch failed: ${error instanceof Error ? error.message : String(error)}`,
      }
      controlPlane?.publishGraphState()
    })

    await waitForWatcherReady(watcher)
    await listen(server, options.port ?? DEFAULT_DEVTOOLS_PORT)
  } catch (error) {
    await watcher?.close()
    server.off('upgrade', rejectUnknownUpgrade)
    await clientChannel.close().catch(() => undefined)
    controlPlane.close()
    await applicationChannel.close().catch(() => undefined)
    throw error
  }

  const address = server.address()
  if (!address || typeof address === 'string') {
    await watcher.close()
    server.off('upgrade', rejectUnknownUpgrade)
    await clientChannel.close()
    controlPlane.close()
    await applicationChannel.close()
    await closeHttpServer(server)
    throw new Error('Loutre Devtools APIのlisten先を取得できませんでした。')
  }

  let closePromise: Promise<void> | undefined
  return {
    hostname: '127.0.0.1',
    port: address.port,
    url: `http://127.0.0.1:${address.port}`,
    clientEndpoint: `ws://127.0.0.1:${address.port}${DEVTOOLS_CLIENT_CHANNEL_PATH}`,
    applicationEndpoint: `ws://127.0.0.1:${address.port}${DEVTOOLS_APPLICATION_CHANNEL_PATH}`,
    close() {
      closePromise ??= (async () => {
        if (reloadTimer) clearTimeout(reloadTimer)
        await watcher.close()
        server.off('upgrade', rejectUnknownUpgrade)
        await clientChannel.close()
        controlPlane.close()
        await applicationChannel.close()
        await closeHttpServer(server)
      })()
      return closePromise
    },
  }
}

function handleHttpRequest(
  request: IncomingMessage,
  response: ServerResponse,
  projectRoot: string,
  entry: string,
): void {
  if (!isDevtoolsLoopbackRequest(request)) {
    writeJson(response, 400, { error: 'Host is not allowed.' })
    return
  }
  const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
  if (request.method === 'GET' && pathname === '/') {
    writeJson(response, 200, {
      name: 'Loutre Devtools',
      protocolVersion: DEVTOOLS_PROTOCOL_VERSION,
      project: basename(projectRoot),
      entry,
      control: DEVTOOLS_CLIENT_CHANNEL_PATH,
      application: DEVTOOLS_APPLICATION_CHANNEL_PATH,
    })
    return
  }
  writeJson(response, 404, { error: 'Not found.' })
}

function writeJson(
  response: ServerResponse,
  status: number,
  body: unknown,
): void {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  })
  response.end(`${JSON.stringify(body)}\n`)
}

function normalizeGraphLoadResult(
  loaded: DevtoolsGraphSnapshot | DevtoolsGraphLoadResult,
): DevtoolsGraphLoadResult {
  return 'snapshot' in loaded ? loaded : { snapshot: loaded }
}

function projectWatchFiles(
  projectRoot: string,
  files: readonly string[],
  customIgnore: readonly string[],
): readonly string[] {
  const ignored = createWatchIgnore(projectRoot, customIgnore)
  return [
    ...new Set(
      files.filter((file) => {
        const projectRelative = normalizeWatchPath(relative(projectRoot, file))
        if (
          projectRelative === '' ||
          projectRelative === '.' ||
          projectRelative.startsWith('../')
        ) {
          return false
        }
        return !ignored(file)
      }),
    ),
  ].toSorted()
}

function shouldReloadPath(
  projectRoot: string,
  watchedPaths: readonly string[] | undefined,
  changedPath: string,
): boolean {
  if (watchedPaths === undefined) return true
  const changed = normalizeWatchPath(relative(projectRoot, changedPath))
  return watchedPaths.some(
    (path) => normalizeWatchPath(relative(projectRoot, path)) === changed,
  )
}

function createWatchIgnore(
  projectRoot: string,
  customIgnore: readonly string[],
): (path: string) => boolean {
  const custom = customIgnore
    .map((value) => normalizeWatchPath(value))
    .filter((value) => value.length > 0 && value !== '.')

  return (path) => {
    const projectRelative = normalizeWatchPath(relative(projectRoot, path))
    if (
      projectRelative === '' ||
      projectRelative === '.' ||
      projectRelative.startsWith('../')
    ) {
      return false
    }
    const segments = projectRelative.split('/')
    if (segments.some((segment) => ignoredPathSegments.has(segment)))
      return true
    return custom.some((ignored) =>
      matchesIgnoredPath(projectRelative, ignored),
    )
  }
}

function matchesIgnoredPath(path: string, ignored: string): boolean {
  if (!ignored.includes('*') && !ignored.includes('?')) {
    if (!ignored.includes('/')) return path.split('/').includes(ignored)
    return path === ignored || path.startsWith(`${ignored}/`)
  }
  return globToRegExp(ignored).test(path)
}

function globToRegExp(pattern: string): RegExp {
  let source = '^'
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index]!
    if (character === '*') {
      if (pattern[index + 1] === '*') {
        source += '.*'
        index += 1
      } else {
        source += '[^/]*'
      }
      continue
    }
    if (character === '?') {
      source += '[^/]'
      continue
    }
    source += character.replace(/[\^$.*+?()[\]{}|]/g, '\\$&')
  }
  return new RegExp(`${source}(?:/.*)?$`)
}

function normalizeWatchPath(path: string): string {
  return path.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+$/, '')
}

function waitForWatcherReady(watcher: FSWatcher): Promise<void> {
  return new Promise((resolve, reject) => {
    const onReady = () => {
      watcher.off('error', onError)
      resolve()
    }
    const onError = (error: unknown) => {
      watcher.off('ready', onReady)
      reject(error)
    }
    watcher.once('ready', onReady)
    watcher.once('error', onError)
  })
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => reject(error)
    server.once('error', onError)
    server.listen(port, '127.0.0.1', () => {
      server.off('error', onError)
      resolve()
    })
  })
}

function closeHttpServer(server: Server): Promise<void> {
  if (!server.listening) return Promise.resolve()
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
}
