import type {
  DependencyConsumerDescriptor,
  ExecutionCompileContext,
  ExecutionContribution,
  ExecutionRuntimeBinding,
  ModelExecutionContribution,
  TokenLike,
} from '@loutrejs/loutre'

declare const context: ExecutionCompileContext
declare const consumer: DependencyConsumerDescriptor
declare const binding: ExecutionRuntimeBinding

const handler = context.compileHandler(
  { kind: 'factory', factory: () => (input: string) => input.length },
  consumer,
)
const invoke = handler.createResolver(binding)()
const length: number = invoke('確認')
// @ts-expect-error handlerの引数型はresolverでも維持する
invoke(123)
// @ts-expect-error Runtime用のresolverは依存metadataを公開しない
handler.dependencies
// @ts-expect-error Runtime用のresolverは委譲metadataを公開しない
handler.delegations

const contribution: ExecutionContribution<null> = {
  kind: 'execution',
  id: 'fixture',
  executionKind: 'fixture.invocation',
  capabilities: [],
  compiled: null,
}
declare const model: ModelExecutionContribution
const dependencies: readonly TokenLike[] = model.dependencies
void [length, contribution, dependencies]
