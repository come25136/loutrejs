# @loutrejs/websocket

Loutre Application Graph KernelへWebSocket session executionを接続する公式Extensionです。

1 connectionを1 executionとして扱い、message codec、送信順序、close lifecycle、shutdown drain、Runtime driver境界を所有します。

```ts
import { websocket } from '@loutrejs/websocket'

const Realtime = websocket.contract({
  chat: {
    path: '/chat',
    messages: websocket.json({ input: ClientMessage, output: ServerMessage }),
  },
})
```

Applicationへ公開されるのは`send()`、`close()`、`closed`、`signal`です。native WebSocket objectは公開しません。
