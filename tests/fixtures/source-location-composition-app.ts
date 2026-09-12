#!/usr/bin/env node
'use strict'

import {
  defineApplication,
  defineModule,
  provide,
  token,
} from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { EventEmitter } from 'node:events'

const __loutreSource = 'user binding' // eslint-disable-line no-underscore-dangle
const __loutreMemberSource = 'user member binding' // eslint-disable-line no-underscore-dangle

export class RealService {}
const Alias = RealService
const ExternalAlias = EventEmitter
const VALUE = token<string>('source-location.composed-value')

const routes = {
  create: {
    method: 'POST',
    path: '/composed',
    responses: { ok: { status: 200 } },
  },
} as const

const providers = [provide(VALUE).useValue('value'), Alias, ExternalAlias]

const Contract = http.contract(routes)
const Controller = http.implementation({
  name: 'ComposedController',
  contract: Contract,
  factory: () => ({
    create(ctx) {
      return ctx.response.ok({})
    },
  }),
})

const Module = defineModule(() => ({
  name: 'ComposedModule',
  providers,
  executions: [Controller],
}))

void __loutreSource
void __loutreMemberSource

export default defineApplication({ modules: [Module()] })
