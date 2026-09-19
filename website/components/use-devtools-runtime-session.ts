'use client'

import { useEffect, useMemo, useState } from 'react'
import { devtoolsErrorMessage } from '../lib/devtools-error'
import {
  clearTraces,
  fetchTrace,
  fetchRuns,
  fetchTraces,
  subscribeRuntimeEvents,
  type DevtoolsRun,
  type DevtoolsTraceSummary,
  type RuntimeEvent,
} from '../lib/devtools-runtime'
import { buildTimeline, type TimelineEntry } from '../lib/devtools-timeline'

interface RuntimeSessionOptions {
  readonly baseUrl: string
  readonly connected: boolean
  readonly requestedTraceId?: string
  readonly requestedSpanId?: string
  readonly onNavigateRuntime: (traceId: string, spanId?: string) => void
}

export interface DevtoolsRuntimeSession {
  readonly traces: readonly DevtoolsTraceSummary[]
  readonly selectedTrace?: DevtoolsTraceSummary
  readonly timeline: ReturnType<typeof buildTimeline>
  readonly selectedSpanId?: string
  readonly selectedTimeline?: TimelineEntry
  readonly hasConnectedRuntime: boolean
  readonly runtimeError?: string
  readonly paused: boolean
  readonly clearingHistory: boolean
  readonly selectTrace: (traceId: string) => void
  readonly selectSpan: (spanId: string) => void
  readonly togglePaused: () => void
  readonly clearHistory: () => Promise<void>
}

export function useDevtoolsRuntimeSession({
  baseUrl,
  connected,
  requestedTraceId,
  requestedSpanId,
  onNavigateRuntime,
}: RuntimeSessionOptions): DevtoolsRuntimeSession {
  const [traces, setTraces] = useState<readonly DevtoolsTraceSummary[]>([])
  const [runs, setRuns] = useState<readonly DevtoolsRun[]>([])
  const [selectedTraceId, setSelectedTraceId] = useState<string>()
  const [events, setEvents] = useState<readonly RuntimeEvent[]>([])
  const [eventsTraceId, setEventsTraceId] = useState<string>()
  const [selectedSpanId, setSelectedSpanId] = useState<string>()
  const [runtimeError, setRuntimeError] = useState<string>()
  const [paused, setPaused] = useState(false)
  const [clearingHistory, setClearingHistory] = useState(false)
  const [runtimeRevision, setRuntimeRevision] = useState(0)

  useEffect(() => {
    setTraces([])
    setRuns([])
    setEvents([])
    setEventsTraceId(undefined)
    setSelectedTraceId(undefined)
    setSelectedSpanId(undefined)
    setRuntimeError(undefined)
    setRuntimeRevision(0)
  }, [baseUrl])

  useEffect(() => {
    if (!requestedTraceId) return
    setSelectedTraceId(requestedTraceId)
    setSelectedSpanId(requestedSpanId)
  }, [baseUrl, requestedSpanId, requestedTraceId])

  useEffect(() => {
    if (!connected || paused) return
    return subscribeRuntimeEvents(baseUrl, () => {
      setRuntimeRevision((revision) => revision + 1)
    })
  }, [baseUrl, connected, paused])

  useEffect(() => {
    if (!connected || paused) return
    let active = true
    void fetchTraces(baseUrl)
      .then((nextTraces) => {
        if (!active) return
        setTraces(nextTraces)
        setRuntimeError(undefined)
        setSelectedTraceId((current) =>
          current && nextTraces.some((trace) => trace.traceId === current)
            ? current
            : nextTraces[0]?.traceId,
        )
      })
      .catch((error: unknown) => {
        if (active) setRuntimeError(devtoolsErrorMessage(error))
      })
    return () => {
      active = false
    }
  }, [baseUrl, connected, paused, runtimeRevision])

  useEffect(() => {
    if (!connected) return
    let active = true
    void fetchRuns(baseUrl)
      .then((nextRuns) => {
        if (active) setRuns(nextRuns)
      })
      .catch((error: unknown) => {
        if (active) setRuntimeError(devtoolsErrorMessage(error))
      })
    return () => {
      active = false
    }
  }, [baseUrl, connected, runtimeRevision])

  useEffect(() => {
    if (!connected || !selectedTraceId) return
    let active = true
    setEventsTraceId((current) =>
      current === selectedTraceId ? current : undefined,
    )
    void fetchTrace(baseUrl, selectedTraceId)
      .then((nextEvents) => {
        if (!active) return
        setEvents(nextEvents)
        setEventsTraceId(selectedTraceId)
        setRuntimeError(undefined)
        setSelectedSpanId((current) =>
          current && nextEvents.some((event) => event.spanId === current)
            ? current
            : buildTimeline(nextEvents).entries[0]?.start.spanId,
        )
      })
      .catch((error: unknown) => {
        if (active) setRuntimeError(devtoolsErrorMessage(error))
      })
    return () => {
      active = false
    }
  }, [baseUrl, connected, runtimeRevision, selectedTraceId])

  const selectedTrace = traces.find(
    (trace) => trace.traceId === selectedTraceId,
  )
  const visibleEvents =
    eventsTraceId === selectedTraceId ? events : ([] as const)
  const timeline = useMemo(() => buildTimeline(visibleEvents), [visibleEvents])
  const selectedTimeline = timeline.entries.find(
    (entry) => entry.start.spanId === selectedSpanId,
  )

  const selectTrace = (traceId: string) => {
    setSelectedTraceId(traceId)
    setSelectedSpanId(undefined)
    setEventsTraceId(undefined)
    onNavigateRuntime(traceId)
  }

  const selectSpan = (spanId: string) => {
    setSelectedSpanId(spanId)
    if (selectedTraceId) onNavigateRuntime(selectedTraceId, spanId)
  }

  const clearHistory = async () => {
    if (clearingHistory) return
    setClearingHistory(true)
    setRuntimeError(undefined)
    try {
      await clearTraces(baseUrl)
      setTraces([])
      setEvents([])
      setEventsTraceId(undefined)
      setSelectedTraceId(undefined)
      setSelectedSpanId(undefined)
    } catch (error) {
      setRuntimeError(devtoolsErrorMessage(error))
    } finally {
      setClearingHistory(false)
    }
  }

  return {
    traces,
    selectedTrace,
    timeline,
    selectedSpanId,
    selectedTimeline,
    hasConnectedRuntime: runs.some((run) => run.stoppedAt === undefined),
    runtimeError,
    paused,
    clearingHistory,
    selectTrace,
    selectSpan,
    togglePaused: () => setPaused((current) => !current),
    clearHistory,
  }
}
