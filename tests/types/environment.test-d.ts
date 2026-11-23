import { env } from '@loutrejs/loutre'
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

class AppEnv extends env(TransformedSchema) {}
declare const appEnv: AppEnv

const port: number = appEnv.port
const driver: 'memory' | 's3' = appEnv.driver
void port
void driver

AppEnv.key('port')
AppEnv.key('driver')
// @ts-expect-error raw input keyではなくtransform後output keyを参照する
AppEnv.key('PORT')

// @ts-expect-error Environment schemaのoutputはobjectでなければならない
env(z.string())
