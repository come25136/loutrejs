import { asModuleInstance, type ModuleInstance } from '../module.js'
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
  source: ModuleInstance,
  target: ModuleInstance,
  token: TokenLike,
  visited = new Set<ModuleInstance>(),
): boolean {
  if (visited.has(source)) return false
  visited.add(source)
  for (const importedValue of source.definition.imports ?? []) {
    const imported = asModuleInstance(importedValue)
    if (!imported.definition.exports?.includes(token)) continue
    if (imported === target) return true
    if (isTokenVisible(imported, target, token, new Set(visited))) return true
  }
  return false
}
