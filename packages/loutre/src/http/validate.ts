import { cors } from './cors.js'
import { validate as inputValidation } from './definitions.js'

export const validate = Object.freeze({
  ...inputValidation,
  cors,
})
