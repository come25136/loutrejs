import type { Locale } from '../../lib/i18n'

export const homeCopy = {
  en: {
    hero: {
      title: 'A TypeScript framework for HTTP and GraphQL',
      lead: 'Type inference, GraphQL batching, and DevTools for exploring your application. Runs on Node.js, Bun, Cloudflare Workers, and more.',
      commandHint: 'Create a project',
    },
    links: {
      github: 'GitHub',
      docs: 'Documentation',
      graphql: 'GraphQL',
      architecture: 'Learn more',
    },
    explicitGraph: {
      title: 'DevTools',
      body: 'Explore modules and dependencies as a graph, and follow the execution path of a request.',
      before: 'Source files',
      after: 'Application Graph',
      questions: [
        'Where is this called from?',
        'What does it depend on?',
        'How far did execution get?',
      ],
      annotation: 'The graph shows routes, handlers, and their dependencies.',
    },
    typeInference: {
      title: 'HTTP type inference',
      body: 'Define requests and responses in a Contract to infer types for handler inputs and return values.',
      editorLabel: 'HTTP type inference code example',
    },
    graphql: {
      title: 'GraphQL',
      body: 'Generate resolver types from SDL. Get argument and return type completion in your editor, and catch schema changes with TypeScript.',
      docs: 'Explore GraphQL',
      example: 'Explore the Counter example',
      editorLabel: 'GraphQL code example',
      features: [
        {
          title: 'Client Codegen',
          body: 'Generate variable and result types from your SDL and client operations.',
        },
        {
          title: 'Subscriptions',
          body: 'Return an AsyncIterable from subscribe to deliver events over WebSocket.',
        },
      ],
    },
    batchResolution: {
      title: 'N+1 queries',
      body: 'Loutre supports batching out of the box. No separate DataLoader setup is needed.',
      details: 'Explore Batch Resolution',
      diagramLabel: 'Three order items passed to one batch loader',
      individual: 'Individual calls',
      batch: 'Batch call',
    },
    agent: {
      title: 'AI agent integration',
      body: 'Give coding agents the Application Graph to trace dependencies and assess where to make changes and what those changes affect.',
      graphLabel: 'Application Graph',
      contextLabel: 'Agent context',
    },
    architecture: {
      title: 'Application Model',
      body: 'The Application Model describes modules, dependencies, execution, and runtime requirements. Runtime, CLI, DevTools, and OpenAPI use this model.',
      annotation:
        'Modules, Providers, Executions, and Runtime Capabilities form the Application Model.',
    },
    runtime: {
      title: 'Multiple runtimes',
      body: 'Run your application on Node.js, Bun, Cloudflare Workers, AWS Lambda, or Electron using the same Application Model.',
    },
    finalCta: {
      title: 'Try Loutre now',
      body: 'Open the Hello HTTP example in StackBlitz and explore Loutre without setting up a local project.',
      stackblitz: 'Try in StackBlitz',
      examples: 'Browse examples',
    },
  },
  ja: {
    hero: {
      title: 'HTTPとGraphQLのTypeScriptフレームワーク',
      lead: '型推論、GraphQLのバッチ処理、構造を確認できるDevToolsを備えています。Node.js、Bun、Cloudflare Workersなどで動作します。',
      commandHint: 'プロジェクトを作成',
    },
    links: {
      github: 'GitHub',
      docs: 'ドキュメント',
      graphql: 'GraphQL',
      architecture: '詳しく見る',
    },
    explicitGraph: {
      title: 'DevTools',
      body: 'モジュールや依存関係をグラフで表示し、リクエストの実行経路を確認できます。',
      before: 'ソースファイル',
      after: 'Application Graph',
      questions: ['どこから呼ばれる？', '何に依存してる？', 'どこへつながる？'],
      annotation: 'ルート、ハンドラー、依存先の関係をグラフで表示します。',
    },
    typeInference: {
      title: 'HTTP APIの型推論',
      body: 'リクエストとレスポンスをContractで定義すると、ハンドラーの引数と戻り値に型が付きます。',
      editorLabel: 'HTTPの型推論のコード例',
    },
    graphql: {
      title: 'GraphQL',
      body: 'SDLからリゾルバーの型を生成します。引数と戻り値を補完し、スキーマと実装のずれをTypeScriptで検出できます。',
      docs: 'GraphQLの使い方',
      example: 'Counterのサンプル',
      editorLabel: 'GraphQLのコード例',
      features: [
        {
          title: 'クライアントの型生成',
          body: 'SDLとクライアント側のGraphQLドキュメントから、変数と取得結果の型を生成できます。',
        },
        {
          title: 'Subscriptions',
          body: 'subscribeからAsyncIterableを返すと、WebSocketでイベントを配信できます。',
        },
      ],
    },
    batchResolution: {
      title: 'N+1対策',
      body: 'バッチ処理をLoutreが標準でサポートしています。DataLoaderを別途組み込む必要はありません。',
      details: 'Batch Resolutionを詳しく見る',
      diagramLabel: '3件の注文商品をまとめて取得する例',
      individual: '個別取得',
      batch: '一括取得',
    },
    agent: {
      title: 'AIエージェントとの連携',
      body: 'Application Graphで呼び出し元と依存先を共有し、AIエージェントが変更箇所や影響範囲を調べやすくします。',
      graphLabel: 'Application Graph',
      contextLabel: 'Agent context',
    },
    architecture: {
      title: 'アプリケーションモデル',
      body: 'モジュール、依存関係、処理、ランタイムの要件をApplication Modelにまとめます。Runtime、CLI、DevTools、OpenAPIはこのモデルを参照します。',
      annotation:
        'Module、Provider、Execution、Runtime CapabilityからApplication Modelを構成します。',
    },
    runtime: {
      title: '複数のランタイムに対応',
      body: 'Node.js、Bun、Cloudflare Workers、AWS Lambda、Electronで動作します。アプリケーションモデルを共通にしたまま、実行環境を選べます。',
    },
    finalCta: {
      title: '今すぐ試す',
      body: 'Hello HTTPのサンプルを、StackBlitzで動かせます。ローカル環境へのセットアップは不要です。',
      stackblitz: 'StackBlitzで試す',
      examples: '他のサンプルを見る',
    },
  },
} as const satisfies Record<Locale, Record<string, unknown>>
