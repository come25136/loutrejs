type GraphQLIdentity<T, Kind extends string> = T & {
  readonly '~loutre.graphql': Kind
}
export type GraphQLTypeName = GraphQLIdentity<string, 'type-name'>
export type GraphQLFieldName = GraphQLIdentity<string, 'field-name'>
export type GraphQLFieldCoordinate = GraphQLIdentity<string, 'field-coordinate'>
export type GraphQLResponseKey = GraphQLIdentity<string, 'response-key'>
export type GraphQLOperationId = GraphQLIdentity<string, 'operation-id'>
export type ArgumentsKey = GraphQLIdentity<string, 'arguments-key'>
export type SelectionMergeKey = GraphQLIdentity<string, 'selection-merge-key'>
export type SelectionKey = GraphQLIdentity<string, 'selection-key'>
export type BatchKey = GraphQLIdentity<string, 'batch-key'>
export type DataScopeKey = GraphQLIdentity<string, 'data-scope-key'>
export type BatchSize = GraphQLIdentity<number, 'batch-size'>
export const typeName = (value: string): GraphQLTypeName =>
  value as GraphQLTypeName
export const fieldName = (value: string): GraphQLFieldName =>
  value as GraphQLFieldName
export const fieldCoordinate = (
  parent: string,
  field: string,
): GraphQLFieldCoordinate => `${parent}.${field}` as GraphQLFieldCoordinate
export const responseKey = (value: string): GraphQLResponseKey =>
  value as GraphQLResponseKey
export const operationId = (value: string): GraphQLOperationId =>
  value as GraphQLOperationId
export const argumentsKey = (value: string): ArgumentsKey =>
  value as ArgumentsKey
export const selectionMergeKey = (
  parent: GraphQLTypeName,
  field: GraphQLFieldName,
  args: ArgumentsKey,
): SelectionMergeKey => `${parent}.${field}:${args}` as SelectionMergeKey
export const opaqueSelectionMergeKey = (ordinal: number): SelectionMergeKey =>
  String(ordinal) as SelectionMergeKey
export const createSelectionKey = (value: string): SelectionKey =>
  value as SelectionKey
export const batchKey = (
  args: ArgumentsKey,
  selection: SelectionKey,
): BatchKey => `${args}:${selection}` as BatchKey
export const opaqueBatchKey = (ordinal: number): BatchKey =>
  `opaque:${ordinal}` as BatchKey
export const dataScopeKey = (value: string): DataScopeKey =>
  value as DataScopeKey
export const batchSize = (value: number): BatchSize => {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new TypeError('maxBatchSizeは正の整数にしてください。')
  return value as BatchSize
}
