import type { Brand } from '../internal/brand.js'

export type DurationMs = Brand<number, 'duration.ms'>
export type DurationSeconds = Brand<number, 'duration.seconds'>
export type EpochMs = Brand<number, 'time.epoch-ms'>
export type MonotonicMs = Brand<number, 'time.monotonic-ms'>
export type ByteLength = Brand<number, 'bytes.length'>
export type ByteLimit = Brand<number, 'bytes.limit'>
export type CaptureDepthLimit = Brand<number, 'capture.depth-limit'>

export const milliseconds = (value: number): DurationMs => value as DurationMs
export const seconds = (value: number): DurationSeconds =>
  value as DurationSeconds
export const epochMilliseconds = (value: number): EpochMs => value as EpochMs
export const monotonicMilliseconds = (value: number): MonotonicMs =>
  value as MonotonicMs
export const byteLimit = (value: number): ByteLimit => value as ByteLimit
export const captureDepthLimit = (value: number): CaptureDepthLimit =>
  value as CaptureDepthLimit
export const utf8ByteLength = (value: string): ByteLength =>
  new TextEncoder().encode(value).byteLength as ByteLength
export const epochNow = (): EpochMs => epochMilliseconds(Date.now())
export const monotonicNow = (): MonotonicMs =>
  monotonicMilliseconds(performance.now())
export const elapsed = (start: MonotonicMs, end: MonotonicMs): DurationMs =>
  milliseconds(end - start)
export const expiresAt = (now: EpochMs, ttl: DurationMs): EpochMs =>
  epochMilliseconds(now + ttl)
export const epochFromMonotonic = (value: MonotonicMs): EpochMs =>
  epochMilliseconds(performance.timeOrigin + value)
export const secondsToMilliseconds = (value: DurationSeconds): DurationMs =>
  milliseconds(value * 1_000)
export const epochDifference = (start: EpochMs, end: EpochMs): DurationMs =>
  milliseconds(end - start)
