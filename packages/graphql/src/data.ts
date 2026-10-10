export type * from './data-types.js'
export { getFieldSelection } from './selection.js'
import type { ReadResult } from './data-types.js'

export const missing = Object.freeze({ kind: 'missing' as const })
export function loaded<T>(
  value: T extends undefined ? never : T,
): ReadResult<T> {
  if (value === undefined)
    throw new TypeError('loaded(undefined)は使用できません。')
  return { kind: 'loaded', value } as ReadResult<T>
}
export const data = Object.freeze({ loaded, missing })
