import { defineEnv } from '@loutrejs/loutre'
import { z } from 'zod'

const TransformedSchema = z
  .object({
    PORT: z.coerce.number(),
    DRIVER: z.enum(['memory', 's3']),
  })
  .transform((raw) => ({
    port: raw.PORT,
    driver: raw.DRIVER,
  }))

class AppEnv extends defineEnv(TransformedSchema) {}
declare const env: AppEnv

const port: number = env.port
const driver: 'memory' | 's3' = env.driver
void port
void driver

AppEnv.key('port')
AppEnv.key('driver')
// @ts-expect-error raw input keyではなくtransform後output keyを参照する
AppEnv.key('PORT')

// @ts-expect-error Environment schemaのoutputはobjectでなければならない
defineEnv(z.string())
