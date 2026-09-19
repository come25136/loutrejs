'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchGraphState,
  reloadGraph,
  subscribeGraphEvents,
  type GraphControlState,
  type GraphSnapshot,
} from '../lib/devtools'
import {
  connectDevtools,
  disconnectDevtools,
  subscribeDevtoolsConnection,
  type DevtoolsConnectionStatus,
} from '../lib/devtools-client'
import { devtoolsErrorMessage } from '../lib/devtools-error'

export interface DevtoolsGraphSession {
  readonly snapshot?: GraphSnapshot
  readonly connectionStatus: DevtoolsConnectionStatus
  readonly connected: boolean
  readonly reloading: boolean
  readonly error?: string
  readonly stale: boolean
  readonly reload: () => Promise<void>
}

export function useDevtoolsGraphSession(
  baseUrl: string | undefined,
): DevtoolsGraphSession {
  const [snapshot, setSnapshot] = useState<GraphSnapshot>()
  const [snapshotBaseUrl, setSnapshotBaseUrl] = useState<string>()
  const [connectionStatus, setConnectionStatus] =
    useState<DevtoolsConnectionStatus>('disconnected')
  const [reloading, setReloading] = useState(false)
  const [error, setError] = useState<string>()
  const [stale, setStale] = useState(false)
  const connectionGeneration = useRef(0)

  const applyGraphState = useCallback(
    (sourceBaseUrl: string, state: GraphControlState) => {
      if (state.snapshot) {
        setSnapshot(state.snapshot)
        setSnapshotBaseUrl(sourceBaseUrl)
      }
      if (state.error) {
        setError(state.error)
        setStale(state.snapshot !== undefined)
        return
      }
      setError(undefined)
      setStale(false)
    },
    [],
  )

  useEffect(() => {
    if (!baseUrl) return

    const generation = connectionGeneration.current + 1
    connectionGeneration.current = generation
    const isCurrent = () => connectionGeneration.current === generation

    const unsubscribeGraph = subscribeGraphEvents(baseUrl, (state) => {
      if (!isCurrent()) return
      try {
        applyGraphState(baseUrl, state)
      } catch (cause) {
        setError(devtoolsErrorMessage(cause))
      }
    })

    const initialConnection = connectDevtools(baseUrl)
    const unsubscribeConnection = subscribeDevtoolsConnection(
      baseUrl,
      (status) => {
        if (!isCurrent()) return
        setConnectionStatus(status)
        if (status !== 'connected') return
        void fetchGraphState(baseUrl)
          .then((state) => {
            if (isCurrent()) applyGraphState(baseUrl, state)
          })
          .catch((cause: unknown) => {
            if (isCurrent()) setError(devtoolsErrorMessage(cause))
          })
      },
    )
    void initialConnection.catch(() => {
      // Transportが再接続を継続するため、障害はconnection statusで通知する。
    })

    return () => {
      connectionGeneration.current += 1
      unsubscribeGraph()
      unsubscribeConnection()
      disconnectDevtools(baseUrl)
    }
  }, [applyGraphState, baseUrl])

  const reload = useCallback(async () => {
    if (!baseUrl) return
    setReloading(true)
    try {
      applyGraphState(baseUrl, await reloadGraph(baseUrl))
    } catch (cause) {
      setError(devtoolsErrorMessage(cause))
    } finally {
      setReloading(false)
    }
  }, [applyGraphState, baseUrl])

  return {
    snapshot: snapshotBaseUrl === baseUrl ? snapshot : undefined,
    connectionStatus,
    connected: connectionStatus === 'connected',
    reloading,
    error,
    stale,
    reload,
  }
}
