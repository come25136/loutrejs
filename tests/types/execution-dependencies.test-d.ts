import {
  token,
  type ExecutionKernelRuntime,
  type ExecutionRuntimeBinding,
} from '@loutrejs/loutre'

const VALUE = token<number>('value')
declare const runtime: ExecutionKernelRuntime
declare const binding: ExecutionRuntimeBinding<{ label: string }>

const value: number = binding.resolve(VALUE)
const label: string = binding.execution.compiled.label
void value
void label
binding.resolve(VALUE, { source: 'logger-label' })

// @ts-expect-error Executionに束縛されていない解決経路を公開しない。
runtime.resolve(VALUE)
// @ts-expect-error 解決のたびに別Executionのidentityを指定できない。
binding.resolve(VALUE, { executionId: 'other' })
// @ts-expect-error canonical Modelのcontributionへresolverを持ち込まない。
binding.execution.resolve(VALUE)
