import {
  type WebSocketDataMessage,
  type WebSocketMessageCodec,
  type WebSocketIncomingMessage,
  type WebSocketCodecKind,
} from '../contract.js'
import {
  WebSocketMessageDecodeError,
  WebSocketMessageEncodeError,
} from '../errors.js'
import { validateSchema } from '../../core/index.js'
import { match as patternMatch } from 'ts-pattern'

export async function* decodeMessages(
  source: AsyncIterable<WebSocketDataMessage>,
  codec: WebSocketMessageCodec | undefined,
): AsyncIterable<WebSocketIncomingMessage<unknown>> {
  if (!codec?.input) return
  for await (const message of source) {
    let decoded: unknown
    try {
      decoded = decodeMessage(codec.kind, message)
    } catch (error) {
      yield {
        kind: 'invalid',
        raw: message.data,
        error:
          error instanceof WebSocketMessageDecodeError
            ? error
            : new WebSocketMessageDecodeError(error),
      }
      continue
    }
    try {
      yield {
        kind: 'valid',
        value: await validateSchema(codec.input, decoded),
      }
    } catch (error) {
      yield {
        kind: 'invalid',
        raw: decoded,
        error: error instanceof Error ? error : new Error(String(error)),
      }
    }
  }
}

function decodeMessage(
  kind: WebSocketCodecKind,
  message: WebSocketDataMessage,
): unknown {
  return patternMatch<[WebSocketCodecKind, WebSocketDataMessage]>([
    kind,
    message,
  ])
    .with(['json', { type: 'text' }], ([, frame]) => {
      try {
        return JSON.parse(frame.data)
      } catch (error) {
        throw new WebSocketMessageDecodeError(error)
      }
    })
    .with(['text', { type: 'text' }], ([, frame]) => frame.data)
    .with(['binary', { type: 'binary' }], ([, frame]) => frame.data)
    .with(
      ['json', { type: 'binary' }],
      ['text', { type: 'binary' }],
      ['binary', { type: 'text' }],
      () => {
        throw new WebSocketMessageDecodeError()
      },
    )
    .exhaustive()
}

export async function encodeMessage(
  codec: WebSocketMessageCodec | undefined,
  value: unknown,
): Promise<WebSocketDataMessage> {
  if (!codec?.output) throw new WebSocketMessageEncodeError()
  const output = await validateSchema(codec.output, value)
  try {
    return patternMatch(codec.kind)
      .returnType<WebSocketDataMessage>()
      .with('json', () => ({ type: 'text', data: JSON.stringify(output) }))
      .with('text', () => {
        if (typeof output !== 'string')
          throw new TypeError('文字列が必要です。')
        return { type: 'text', data: output }
      })
      .with('binary', () => {
        if (!(output instanceof Uint8Array))
          throw new TypeError('Uint8Arrayが必要です。')
        return { type: 'binary', data: output }
      })
      .exhaustive()
  } catch (error) {
    throw new WebSocketMessageEncodeError(error)
  }
}
