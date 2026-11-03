import type { TokenLike } from './token.js'

export const frameworkProvidedTokenBrand = Symbol.for(
  'loutre.framework-provided-token',
)

export function isFrameworkProvidedToken(token: TokenLike): boolean {
  return (
    Object.hasOwn(token, frameworkProvidedTokenBrand) &&
    frameworkProvidedTokenBrand in token &&
    token[frameworkProvidedTokenBrand] === true
  )
}
