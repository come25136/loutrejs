import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from '@xyflow/react'
import type { EdgeRoutePoint, LoutreFlowEdge } from './graph-adapter'

function distance(from: EdgeRoutePoint, to: EdgeRoutePoint): number {
  return Math.hypot(to.x - from.x, to.y - from.y)
}

export function roundedOrthogonalPath(
  points: readonly EdgeRoutePoint[],
  radius = 10,
): string {
  if (points.length === 0) return ''
  const first = points[0]!
  if (points.length === 1) return `M ${first.x} ${first.y}`
  let path = `M ${first.x} ${first.y}`
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1]!
    const current = points[index]!
    const next = points[index + 1]!
    const incomingLength = distance(previous, current)
    const outgoingLength = distance(current, next)
    if (incomingLength === 0 || outgoingLength === 0) continue
    const incomingScale = Math.min(radius, incomingLength / 2) / incomingLength
    const outgoingScale = Math.min(radius, outgoingLength / 2) / outgoingLength
    const incoming = {
      x: current.x + (previous.x - current.x) * incomingScale,
      y: current.y + (previous.y - current.y) * incomingScale,
    }
    const outgoing = {
      x: current.x + (next.x - current.x) * outgoingScale,
      y: current.y + (next.y - current.y) * outgoingScale,
    }
    path += ` L ${incoming.x} ${incoming.y} Q ${current.x} ${current.y} ${outgoing.x} ${outgoing.y}`
  }
  const end = points.at(-1)!
  return `${path} L ${end.x} ${end.y}`
}

export function polylineMidpoint(
  points: readonly EdgeRoutePoint[],
): EdgeRoutePoint {
  if (points.length === 0) return { x: 0, y: 0 }
  if (points.length === 1) return points[0]!
  const lengths = points
    .slice(1)
    .map((point, index) => distance(points[index]!, point))
  const halfway = lengths.reduce((sum, length) => sum + length, 0) / 2
  let traveled = 0
  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index]!
    if (traveled + length >= halfway) {
      const ratio = length === 0 ? 0 : (halfway - traveled) / length
      const from = points[index]!
      const to = points[index + 1]!
      return {
        x: from.x + (to.x - from.x) * ratio,
        y: from.y + (to.y - from.y) * ratio,
      }
    }
    traveled += length
  }
  return points.at(-1)!
}

export function GraphEdge(props: EdgeProps<LoutreFlowEdge>) {
  const route = props.data?.route
  const fallback = getSmoothStepPath(props)
  const followsHandles = props.data?.followHandles === true
  const highlighted = props.data?.highlighted === true
  const dashed = props.data?.dashed === true
  const path =
    route && route.length >= 2 && !followsHandles
      ? roundedOrthogonalPath(route)
      : fallback[0]
  const labelPosition =
    !followsHandles && props.data?.labelPosition
      ? props.data.labelPosition
      : route && !followsHandles
        ? polylineMidpoint(route)
        : { x: fallback[1], y: fallback[2] }
  const start = followsHandles
    ? { x: props.sourceX, y: props.sourceY }
    : route?.[0]
  const end = followsHandles
    ? { x: props.targetX, y: props.targetY }
    : route?.at(-1)
  return (
    <>
      {highlighted && (
        <BaseEdge
          className={`graph-edge__glow ${dashed ? 'is-dashed' : ''}`}
          path={path}
          style={{
            stroke: 'var(--site-accent-text)',
            strokeWidth: 7,
            opacity: 0.16,
            vectorEffect: 'non-scaling-stroke',
          }}
        />
      )}
      <BaseEdge
        className={`${followsHandles ? 'graph-edge__path is-following' : 'graph-edge__path'} ${highlighted ? 'is-highlighted' : ''} ${dashed ? 'is-dashed' : ''}`}
        path={path}
        {...(props.markerEnd === undefined
          ? {}
          : { markerEnd: props.markerEnd })}
        style={{
          stroke: highlighted
            ? 'var(--site-accent-text)'
            : 'var(--site-line-strong)',
          strokeWidth: highlighted ? 2.1 : 1.6,
          vectorEffect: 'non-scaling-stroke',
        }}
      />
      {highlighted && (
        <BaseEdge
          className={`graph-edge__pulse ${dashed ? 'is-dashed' : ''}`}
          path={path}
          style={{
            stroke: 'var(--site-accent-text)',
            strokeWidth: 2.8,
            strokeLinecap: 'round',
            vectorEffect: 'non-scaling-stroke',
          }}
        />
      )}
      {start && (
        <circle
          className={`graph-edge__endpoint ${highlighted ? 'is-highlighted' : ''}`}
          cx={start.x}
          cy={start.y}
          r={3.5}
        />
      )}
      {end && (
        <circle
          className={`graph-edge__endpoint ${highlighted ? 'is-highlighted' : ''}`}
          cx={end.x}
          cy={end.y}
          r={3.5}
        />
      )}
      {props.label && (
        <EdgeLabelRenderer>
          <span
            className={`graph-edge__label ${highlighted ? 'is-highlighted' : ''}`}
            style={{
              transform: `translate(-50%, -50%) translate(${labelPosition.x}px, ${labelPosition.y}px)`,
            }}
          >
            {String(props.label)}
          </span>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
