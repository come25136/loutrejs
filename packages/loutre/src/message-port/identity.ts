import type { Brand } from '../internal/brand.js'
export type MessagePortRequestId = Brand<string, 'message-port.request-id'>
export type MessagePortProcedureName = Brand<string, 'message-port.procedure'>
export const messagePortProcedureName = (
  value: string,
): MessagePortProcedureName => value as MessagePortProcedureName
export function decodeMessagePortRequest(value: unknown):
  | {
      readonly id: MessagePortRequestId
      readonly procedure: MessagePortProcedureName
      readonly input?: unknown
    }
  | undefined {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    !('id' in value) ||
    !('procedure' in value) ||
    typeof value.id !== 'string' ||
    typeof value.procedure !== 'string'
  )
    return undefined
  return {
    id: value.id as MessagePortRequestId,
    procedure: messagePortProcedureName(value.procedure),
    ...('input' in value ? { input: value.input } : {}),
  }
}
