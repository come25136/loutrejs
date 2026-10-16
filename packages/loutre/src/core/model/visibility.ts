import type { ModuleInstance } from '../module.js'
import type { ModelBuildContext } from './context.js'
import { normalizeProvider } from '../provider.js'
import type { TokenLike } from '../token.js'

export function moduleDeclaresToken(
  module: ModuleInstance,
  token: TokenLike,
): boolean {
  return (module.definition.providers ?? []).some(
    (declaration) => normalizeProvider(declaration).provide === token,
  )
}

export function isTokenVisible(
  context: ModelBuildContext,
  source: ModuleInstance,
  target: ModuleInstance,
  token: TokenLike,
  visited = new Set<ModuleInstance>(),
): boolean {
  if (visited.has(source)) return false
  visited.add(source)
  for (const imported of context.imports.get(source) ?? []) {
    if (!imported.definition.exports?.includes(token)) continue
    if (imported === target) return true
    if (isTokenVisible(context, imported, target, token, new Set(visited)))
      return true
  }
  return false
}
