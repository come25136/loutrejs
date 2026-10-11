import type { CommerceService } from '../domain/commerce.js'
export interface AppContext {
  readonly commerce: CommerceService
  readonly signal: AbortSignal
}
