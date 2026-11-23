import { parser } from '@lezer/javascript'

const ts = parser.configure({ dialect: 'ts' })
const tsx = parser.configure({ dialect: 'ts jsx' })
const protocols = new Set(['http', 'mcp', 'websocket', 'messagePort'])

function nextToken(node) {
  let next = node?.nextSibling
  while (next?.name === 'BlockComment' || next?.name === 'LineComment')
    next = next.nextSibling
  return next
}

function unwrap(node) {
  if (node?.name === 'ParenthesizedExpression')
    return unwrap(nextToken(node.firstChild))
  if (
    node?.name === 'InstantiationExpression' ||
    (node?.name === 'PostfixExpression' &&
      node.lastChild?.name === 'LogicOp') ||
    (node?.name === 'BinaryExpression' &&
      (node.getChild('as') || node.getChild('satisfies')))
  )
    return unwrap(node.firstChild)
  return node
}

function memberName(source, node) {
  if (node?.name === 'MemberExpression') node = node.getChild('PropertyName')
  if (node?.name !== 'VariableName' && node?.name !== 'PropertyName') return
  return source.slice(node.from, node.to)
}

function createsContract(source, initializer) {
  const call = unwrap(initializer)
  if (call?.name !== 'CallExpression') return false
  const factory = unwrap(call.firstChild)
  const name = memberName(source, factory)
  if (!name) return false
  if (name === 'contract')
    return (
      factory.name === 'VariableName' ||
      protocols.has(memberName(source, factory.firstChild))
    )
  return /^(?:define(?:Http|Mcp|WebSocket|MessagePort)|create[A-Z]\w*)Contract$/.test(
    name,
  )
}

function delegatedRouteOwner(source, property) {
  if (
    source.slice(property.firstChild.from, property.firstChild.to) !== 'route'
  )
    return
  const call = property.parent?.parent?.parent
  if (
    call?.name !== 'CallExpression' ||
    property.parent?.parent?.name !== 'ArgList'
  )
    return
  const factory = call.firstChild
  if (
    memberName(source, factory) !== 'implementation' ||
    !['mcp', 'graphql'].includes(memberName(source, factory.firstChild))
  )
    return
  const route = property.lastChild
  const routes = route?.firstChild
  if (
    route?.name === 'MemberExpression' &&
    memberName(source, routes) === 'routes' &&
    routes.firstChild?.name === 'VariableName'
  )
    return routes.firstChild
}

function* bindings(source, language) {
  // README や ADR の断片的なコード例も構文解析する。
  const tree = (language.endsWith('x') ? tsx : ts).parse(source)
  const cursor = tree.cursor()
  do {
    let binding
    if (cursor.name === 'VariableDefinition') {
      binding = cursor.node
      if (binding.parent?.name !== 'VariableDeclaration') continue
      let equals = nextToken(binding)
      if (equals?.name === 'TypeAnnotation') equals = nextToken(equals)
      if (
        equals?.name !== 'Equals' ||
        !createsContract(source, nextToken(equals))
      )
        continue
    } else if (cursor.name === 'Property') {
      binding = delegatedRouteOwner(source, cursor.node)
    }
    if (!binding) continue
    const name = source.slice(binding.from, binding.to)
    if (name !== 'contract' && !name.endsWith('Contract'))
      yield { name, offset: binding.from }
  } while (cursor.next())
}

export function* contractNameViolations(source, file) {
  if (!/contract|\.routes/i.test(source)) return
  if (!/\.mdx?$/.test(file)) {
    yield* bindings(source, file)
    return
  }
  const fence =
    /^ *(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)(?:^ *\1[\t ]*\r?$|(?![\s\S]))/gm
  for (const match of source.matchAll(fence)) {
    const language = match[2].trim().split(/\s+/)[0]
    if (!/^(?:[cm]?[jt]sx?|javascript|typescript)$/.test(language)) continue
    const start = match.index + match[0].indexOf('\n') + 1
    for (const { name, offset } of bindings(match[3], language))
      yield { name, offset: start + offset }
  }
}
