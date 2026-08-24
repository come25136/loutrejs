import { contextKey } from '@loutrejs/core'

export const FIRST_SESSION = contextKey('session').of<string>()
export const SECOND_SESSION = contextKey('session').of<string>()
