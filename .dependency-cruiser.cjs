/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: '解決できない依存を禁止する',
      severity: 'error',
      comment:
        'aliasを未解決のまま扱うとarchitecture ruleを迂回できるため、すべてのimportを解決可能にする。',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: '循環依存を禁止する',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'Coreを上位層から分離する',
      severity: 'error',
      comment: 'CoreはApplication、Graph、Runtime実装、Adapterを認識しない。',
      from: { path: '^packages/loutre/src/core(?:/|$)' },
      to: {
        path: '^packages/loutre/src/(?:application|graph|adapters|runtime)(?:/|$)',
      },
    },
    {
      name: 'Frameworkを具体protocolから分離する',
      severity: 'error',
      comment:
        'Core/Application/Graph/Runtimeは具体的なExecution Extensionへ逆依存しない。',
      from: {
        path: '^packages/loutre/src/(?:core|application|graph|runtime)(?:/|$)',
      },
      to: {
        path: '^packages/loutre/src/(?:http|tasks|message-port|websocket)(?:/|$)',
      },
    },
    {
      name: 'Graphを実行実装から分離する',
      severity: 'error',
      comment:
        'Graph projectionはcanonical Application ModelとExtension contributionだけを消費する。',
      from: { path: '^packages/loutre/src/graph(?:/|$)' },
      to: {
        path: '^packages/loutre/src/(?:application/kernel|adapters|runtime/(?:kernel|di|execution-tracker)|http/runtime|tasks/runtime|message-port/runtime|websocket/runtime)(?:/|$|\\.ts$)',
      },
    },
    {
      name: 'HTTPから他protocolへの依存を禁止する',
      severity: 'error',
      comment:
        'Execution Extension間は明示allowlist制とし、HTTPから他Extensionへは依存しない。',
      from: { path: '^packages/loutre/src/http(?:/|$)' },
      to: {
        path: '^packages/loutre/src/(?:tasks|message-port|websocket)(?:/|$)',
      },
    },
    {
      name: 'Tasksから他protocolへの依存を禁止する',
      severity: 'error',
      comment:
        'Execution Extension間は明示allowlist制とし、Tasksから他Extensionへは依存しない。',
      from: { path: '^packages/loutre/src/tasks(?:/|$)' },
      to: {
        path: '^packages/loutre/src/(?:http|message-port|websocket)(?:/|$)',
      },
    },
    {
      name: 'MessagePortから他protocolへの依存を禁止する',
      severity: 'error',
      comment:
        'Execution Extension間は明示allowlist制とし、MessagePortから他Extensionへは依存しない。',
      from: { path: '^packages/loutre/src/message-port(?:/|$)' },
      to: {
        path: '^packages/loutre/src/(?:http|tasks|websocket)(?:/|$)',
      },
    },
    {
      name: 'WebSocketのprotocol依存をHTTPだけに制限する',
      severity: 'error',
      comment:
        'WebSocket handshake integrationのHTTP依存だけをallowlistし、他Extensionへの依存は禁止する。',
      from: { path: '^packages/loutre/src/websocket(?:/|$)' },
      to: { path: '^packages/loutre/src/(?:tasks|message-port)(?:/|$)' },
    },
    {
      name: 'Protocolからruntime adapterへの依存を禁止する',
      severity: 'error',
      from: {
        path: '^packages/loutre/src/(?:http|tasks|message-port|websocket)(?:/|$)',
      },
      to: { path: '^packages/loutre/src/adapters(?:/|$)' },
    },
    {
      name: 'Runtime adapterからprotocol内部への依存を禁止する',
      severity: 'error',
      comment: 'Runtime adapterはprotocolのpublic facadeだけを利用する。',
      from: {
        path: '^(?:packages/loutre/src/adapters|packages/node/src)(?:/|$)',
      },
      to: {
        path: '^packages/loutre/src/(?:http|tasks|message-port|websocket)/(?!index\\.ts$)',
      },
    },
    {
      name: 'HTTPをNode組み込みAPIから分離する',
      severity: 'error',
      comment: 'HTTP extensionはWeb Platform APIだけで動作する。',
      from: { path: '^packages/loutre/src/http(?:/|$)' },
      to: { dependencyTypes: ['core'] },
    },
  ],
  options: {
    parser: 'swc',
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
  },
}
