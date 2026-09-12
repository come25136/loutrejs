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
      name: 'Coreを上位層とprotocolから分離する',
      severity: 'error',
      comment:
        'CoreはApplication、Runtime実装、具体的なExecution Extensionを認識しない。',
      from: { path: '^packages/loutre/src/core(?:/|$)' },
      to: {
        path: '^packages/loutre/src/(?:application|adapters|runtime|http|tasks|message-port|websocket)(?:/|$)',
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
