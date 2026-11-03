export const loggerTokenBrand = Symbol.for('loutre.logger.token')
export const loggerInstanceBrand = Symbol.for('loutre.logger.instance')
export const loggerSourceRoot = Symbol.for('loutre.logger.source-root')

export function isLoggerTokenIdentity(value: unknown): boolean {
  return (
    typeof value === 'function' &&
    Object.hasOwn(value, loggerTokenBrand) &&
    loggerTokenBrand in value &&
    value[loggerTokenBrand] === true
  )
}
