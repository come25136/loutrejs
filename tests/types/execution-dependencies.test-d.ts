import { token, type ExecutionKernelRuntime } from '@loutrejs/loutre'

const VALUE = token<number>('value')
declare const runtime: ExecutionKernelRuntime

const value: number = runtime.resolve(VALUE, { executionId: 'execution.id' })
void value

// @ts-expect-error 所属Executionなしの解決は宣言照合できない。
runtime.resolve(VALUE)
// @ts-expect-error 診断用のsourceはExecutionのidentityを代用しない。
runtime.resolve(VALUE, { source: 'execution.id' })
// @ts-expect-error 表示用のconsumerはExecutionのidentityを代用しない。
runtime.resolve(VALUE, { consumer: { id: 'execution.id', name: 'example' } })
