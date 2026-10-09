import {
  getNamedType,
  isObjectType,
  isInterfaceType,
  isAbstractType,
  getArgumentValues,
  getDirectiveValues,
  GraphQLSkipDirective,
  GraphQLIncludeDirective,
  type GraphQLResolveInfo,
  type GraphQLObjectType,
  type SelectionNode,
  type GraphQLSchema,
} from 'graphql'
import type { FieldSelection } from './data-types.js'
import type { DataDefinition } from './data-internal.js'
import { normalizeFieldArguments } from './arguments.js'

export function analyzeDemand(
  info: GraphQLResolveInfo,
  metadata: ReadonlyMap<string, DataDefinition>,
): FieldSelection {
  const root = info.fieldNodes[0]!
  const definition = info.parentType.getFields()[info.fieldName]!
  const args = getArgumentValues(definition, root, info.variableValues)
  const children = (
    nodes: readonly SelectionNode[],
    name: ReturnType<typeof getNamedType>,
  ): FieldSelection[] => {
    const concrete = isObjectType(name)
      ? [name]
      : isAbstractType(name)
        ? info.schema.getPossibleTypes(name)
        : []
    return concrete.flatMap((type) => collect(nodes, type))
  }
  const collect = (
    nodes: readonly SelectionNode[],
    type: GraphQLObjectType,
    seen = new Set<string>(),
  ): FieldSelection[] => {
    const results: FieldSelection[] = []
    for (const node of nodes) {
      if (
        getDirectiveValues(GraphQLSkipDirective, node, info.variableValues)
          ?.if === true ||
        getDirectiveValues(GraphQLIncludeDirective, node, info.variableValues)
          ?.if === false
      )
        continue
      if (node.kind === 'Field') {
        const field = type.getFields()[node.name.value]
        if (!field && node.name.value !== '__typename') continue
        const identity = `${type.name}.${node.name.value}`
        const data = metadata.get(identity)
        results.push({
          parentType: type.name,
          fieldName: node.name.value,
          responseKeys: [node.alias?.value ?? node.name.value],
          args: field
            ? getArgumentValues(field, node, info.variableValues)
            : {},
          requires: data?.kind === 'field' ? (data.options.requires ?? []) : [],
          prefetchable: data?.kind === 'field',
          children: field
            ? children(
                node.selectionSet?.selections ?? [],
                getNamedType(field.type),
              )
            : [],
        })
      } else if (node.kind === 'InlineFragment') {
        const condition =
          node.typeCondition &&
          info.schema.getType(node.typeCondition.name.value)
        if (
          !condition ||
          condition === type ||
          (isAbstractType(condition) && info.schema.isSubType(condition, type))
        )
          results.push(...collect(node.selectionSet.selections, type, seen))
      } else {
        if (seen.has(node.name.value)) continue
        const fragment = info.fragments[node.name.value]
        if (!fragment) continue
        const condition = info.schema.getType(fragment.typeCondition.name.value)
        if (
          condition === type ||
          (condition &&
            isAbstractType(condition) &&
            info.schema.isSubType(condition, type))
        )
          results.push(
            ...collect(
              fragment.selectionSet.selections,
              type,
              new Set([...seen, node.name.value]),
            ),
          )
      }
    }
    const merged = new Map<string, FieldSelection>()
    for (const field of results) {
      const argsKey = normalizeFieldArguments(
        field.args,
        type.getFields()[field.fieldName]?.args ?? [],
      )
      const key =
        argsKey === undefined
          ? String(merged.size)
          : `${field.parentType}.${field.fieldName}:${argsKey}`
      const previous = merged.get(key)
      merged.set(
        key,
        previous
          ? {
              ...field,
              responseKeys: [
                ...new Set([...previous.responseKeys, ...field.responseKeys]),
              ],
              children: [...previous.children, ...field.children],
            }
          : field,
      )
    }
    return [...merged.values()]
  }
  const data = metadata.get(`${info.parentType.name}.${info.fieldName}`)
  return {
    parentType: info.parentType.name,
    fieldName: info.fieldName,
    responseKeys: [root.alias?.value ?? info.fieldName],
    args,
    requires: data?.kind === 'field' ? (data.options.requires ?? []) : [],
    prefetchable: data?.kind === 'field',
    children: children(
      info.fieldNodes.flatMap((node) => node.selectionSet?.selections ?? []),
      getNamedType(info.returnType),
    ),
  }
}

export function selectionKey(
  selection: FieldSelection,
  schema: GraphQLSchema,
): string | undefined {
  const children: string[] = []
  for (const child of selection.children) {
    const type = schema.getType(child.parentType)
    const definitions =
      type && (isObjectType(type) || isInterfaceType(type))
        ? (type.getFields()[child.fieldName]?.args ?? [])
        : []
    const args = normalizeFieldArguments(child.args, definitions)
    const descendants = selectionKey(child, schema)
    if (args === undefined || descendants === undefined) return undefined
    children.push(
      `${child.parentType}.${child.fieldName}:${args}:${descendants}`,
    )
  }
  return JSON.stringify([...new Set(children)].toSorted())
}
