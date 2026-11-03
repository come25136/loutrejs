export const loggerTokenBrand = Symbol.for('loutre.logger.token')
export const loggerInstanceBrand = Symbol.for('loutre.logger.instance')

export function isLoggerTokenIdentity(value: unknown): boolean {
  return (
    typeof value === 'function' &&
    Object.hasOwn(value, loggerTokenBrand) &&
    loggerTokenBrand in value &&
    value[loggerTokenBrand] === true
  )
}
