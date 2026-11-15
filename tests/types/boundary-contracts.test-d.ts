import { match } from 'ts-pattern'
import {
  type ExecutionDelegation,
  type ExecutionHandlerSource,
} from '@loutrejs/loutre'
import { task, type TasksCompiledExecution } from '@loutrejs/loutre/tasks'
import type { WebSocketDataMessage } from '@loutrejs/loutre/websocket'

declare const source: ExecutionHandlerSource<() => number>
declare const delegate: ExecutionDelegation<() => number>
const factory: ExecutionHandlerSource<() => number> = {
  kind: 'factory',
  factory: () => () => 1,
}
const delegated: ExecutionHandlerSource<() => number> = {
  kind: 'delegate',
  delegate,
}
void [factory, delegated]
// @ts-expect-error 未知の取得方法は指定できない
const invalid: ExecutionHandlerSource<() => number> = { kind: 'other' }
// @ts-expect-error factoryにはfactoryが必要
const missing: ExecutionHandlerSource<() => number> = { kind: 'factory' }
const mismatch: ExecutionHandlerSource<() => number> = {
  kind: 'delegate',
  // @ts-expect-error kindとpayloadを取り違えない
  factory: () => () => 1,
}
void [invalid, missing, mismatch]
match(source)
  .with({ kind: 'factory' }, () => undefined)
  // @ts-expect-error delegateを処理しないmatchは完結しない
  .exhaustive()

const definition = task({ name: 'fixture', factory: () => () => 1 })
const kind: 'task' = definition.declaration.kind
void kind
declare const compiled: TasksCompiledExecution
match(compiled)
  .with({ kind: 'task' }, () => undefined)
  .with({ kind: 'cron' }, () => undefined)
  .with({ kind: 'fixed-delay' }, () => undefined)
  // @ts-expect-error queue-consumerを処理しないmatchは完結しない
  .exhaustive()

const frame: WebSocketDataMessage = { kind: 'text', data: '本文' }
// @ts-expect-error binary frameは文字列を持たない
const wrongFrame: WebSocketDataMessage = { kind: 'binary', data: '本文' }
void [frame, wrongFrame]
