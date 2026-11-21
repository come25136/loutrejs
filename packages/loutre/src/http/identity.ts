import type { Brand } from '../internal/brand.js'

export type HttpPathTemplate = Brand<string, 'http.path-template'>
export type HttpNormalizedPath = Brand<string, 'http.normalized-path'>
export type RequestPathname = Brand<string, 'http.request-pathname'>
export type HttpMethod = Brand<string, 'http.method'>
export type HttpDispatchKey = Brand<string, 'http.dispatch-key'>
export type HttpProcedureName = Brand<string, 'http.procedure'>
export type HttpHeaderName = Brand<string, 'http.header-name'>
export type CorsOriginValue = Brand<string, 'http.cors-origin'>
export type ContentTypeValue = Brand<string, 'http.content-type'>
export type NormalizedMediaType = Brand<string, 'http.media-type'>
export type HttpResponseStatus = Brand<number, 'http.response-status'>
export type HttpBaseUrl = Brand<string, 'http.base-url'>

export const normalizeHttpMethod = (value: string): HttpMethod =>
  value.toUpperCase() as HttpMethod
export const requestPathname = (value: string): RequestPathname =>
  value as RequestPathname
export const httpProcedureName = (value: string): HttpProcedureName =>
  value as HttpProcedureName
export const httpHeaderName = (value: string): HttpHeaderName =>
  value as HttpHeaderName
export const corsOriginValue = (value: string): CorsOriginValue =>
  value as CorsOriginValue
export const httpBaseUrl = (value: string | URL): HttpBaseUrl =>
  String(value) as HttpBaseUrl
export function normalizeMediaType(
  value: string | null | undefined,
): NormalizedMediaType | undefined {
  const normalized = value?.split(';', 1)[0]?.trim().toLowerCase()
  return normalized ? (normalized as NormalizedMediaType) : undefined
}
