import { layer } from '@loutrejs/core'
import { http } from '@loutrejs/http'
import { messagePort } from '@loutrejs/message-port'
import { z } from 'zod'

const generic = layer({ name: 'generic' })
const composite = <const TPipeline extends readonly import('@loutrejs/core').PipelineItem[]>(
  pipeline: TPipeline,
) => layer.compose({
  name: 'composite',
  pipeline,
  scope: () => ({ run: async (execute) => { await execute() } }),
})

http({
  method: 'GET',
  path: '/nested-terminal',
  responses: { ok: { status: 200, body: z.string() } },
  pipeline: [generic, composite([generic, http.controller])],
})

http({
  method: 'GET',
  path: '/missing-terminal',
  responses: { ok: { status: 200, body: z.string() } },
  // @ts-expect-error HTTP Pipelineの最後にはhttp.controllerが必要
  pipeline: [generic, composite([generic])],
})

http({
  method: 'GET',
  path: '/after-nested-terminal',
  responses: { ok: { status: 200, body: z.string() } },
  // @ts-expect-error Composite内のterminal後にもPipelineItemは置けない
  pipeline: [composite([http.controller]), generic],
})

http({
  method: 'GET',
  path: '/two-terminals',
  responses: { ok: { status: 200, body: z.string() } },
  // @ts-expect-error 再帰Pipeline全体でterminalは1つだけ許可される
  pipeline: [composite([http.controller]), http.controller],
})

http({
  method: 'GET',
  path: '/wrong-terminal',
  responses: { ok: { status: 200, body: z.string() } },
  // @ts-expect-error HTTP PipelineにはMessagePort terminalを置けない
  pipeline: [messagePort.handler],
})

messagePort({
  responses: { ok: { body: z.string() } },
  pipeline: [composite([generic, messagePort.handler])],
})

messagePort({
  responses: { ok: { body: z.string() } },
  // @ts-expect-error MessagePort Pipelineの最後にはmessagePort.handlerが必要
  pipeline: [generic],
})

messagePort({
  responses: { ok: { body: z.string() } },
  // @ts-expect-error MessagePort PipelineにはHTTP terminalを置けない
  pipeline: [http.controller],
})
