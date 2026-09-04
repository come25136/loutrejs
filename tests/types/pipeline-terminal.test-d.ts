import { layer } from '@loutrejs/loutre'
import { http } from '@loutrejs/loutre/http'
import { messagePort } from '@loutrejs/loutre/message-port'
import { z } from 'zod'
const generic = layer({
  name: 'generic',
  factory: () => async (_ctx, next) => {
    await next()
  },
})
http.route({
  method: 'GET',
  path: '/nested-terminal',
  responses: { ok: { status: 200, body: z.string() } },
  pipeline: [generic, generic([generic, http.controller])],
})
http.route({
  method: 'GET',
  path: '/missing-terminal',
  responses: { ok: { status: 200, body: z.string() } },
  // @ts-expect-error HTTP Pipelineの最後にはhttp.controllerが必要
  pipeline: [generic, generic([generic])],
})
http.route({
  method: 'GET',
  path: '/after-nested-terminal',
  responses: { ok: { status: 200, body: z.string() } },
  // @ts-expect-error child内のterminal後にもPipelineItemは置けない
  pipeline: [generic([http.controller]), generic],
})
http.route({
  method: 'GET',
  path: '/two-terminals',
  responses: { ok: { status: 200, body: z.string() } },
  // @ts-expect-error 再帰Pipeline全体でterminalは1つだけ許可される
  pipeline: [generic([http.controller]), http.controller],
})
http.route({
  method: 'GET',
  path: '/wrong-terminal',
  responses: { ok: { status: 200, body: z.string() } },
  // @ts-expect-error HTTP PipelineにはMessagePort terminalを置けない
  pipeline: [messagePort.handler],
})
messagePort.route({
  responses: { ok: { body: z.string() } },
  pipeline: [generic([generic, messagePort.handler])],
})
messagePort.route({
  responses: { ok: { body: z.string() } },
  // @ts-expect-error MessagePort Pipelineの最後にはmessagePort.handlerが必要
  pipeline: [generic],
})
messagePort.route({
  responses: { ok: { body: z.string() } },
  // @ts-expect-error MessagePort PipelineにはHTTP terminalを置けない
  pipeline: [http.controller],
})
