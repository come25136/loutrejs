import type { Locale } from '../../lib/i18n'

export const homeCopy = {
  en: {
    hero: {
      title: ['TypeScript framework', 'for any runtime.'],
      lead: [
        'Define one Application Model, then run it on Node.js, Bun, Deno, Cloudflare Workers, AWS Lambda, and Electron.',
        'Loutre Dev lets you trace the structure and execution from that same model.',
      ],
      commandHint: 'Start local developer tooling',
    },
    links: {
      github: 'GitHub',
      docs: 'Documentation',
      architecture: 'Learn more',
    },
    explicitGraph: {
      title: ["You shouldn't have to infer", 'the whole app from files.'],
      body: [
        'Loutre builds Modules, Providers, Executions, and Runtime Capabilities into one canonical Application Model.',
        'Its Graph projection keeps ownership, injection, requirements, routes, middleware, and handlers explicit.',
      ],
      before: 'From files',
      after: 'With Loutre',
      questions: [
        'Where is this called from?',
        'What does it depend on?',
        'How far did execution get?',
      ],
      annotation: 'The path is explicit.',
    },
    typeInference: {
      eyebrow: 'TYPE INFERENCE',
      title: 'Define types once.',
      body: 'Define the Contract once, and request and response handling stays typed throughout the implementation.',
      note: 'No declare / as / is needed to carry those types.',
      codeComment: 'inferred as string',
    },
    agent: {
      eyebrow: 'FOR AI AGENTS',
      title: ['One Application Graph.', 'For developers and agents.'],
      body: 'Share the same Application Graph with coding agents so structure and dependencies do not have to be inferred from files alone.',
      graphLabel: 'Application Graph',
      contextLabel: 'Agent context',
    },
    architecture: {
      eyebrow: 'ARCHITECTURE',
      title: 'One model for the whole application.',
      body: 'Modules, Providers, Executions, and Runtime Capabilities come together in one Application Model shared by Runtime, CLI, DevTools, and OpenAPI.',
      annotation: 'One model. Whole picture.',
    },
    runtime: {
      eyebrow: 'MULTI-RUNTIME',
      title: 'Develop on the runtime you prefer.',
      body: [
        'Keep the application model and choose the runtime that fits your environment.',
        'Run the same code on Node.js, Bun, Deno, Cloudflare Workers, AWS Lambda, or Electron.',
      ],
    },
    finalCta: {
      title: 'Hello Loutre!',
      body: 'Open the Hello HTTP example in StackBlitz and explore Loutre without setting up a local project.',
      stackblitz: 'Try in StackBlitz',
      examples: 'Browse examples',
    },
  },
  ja: {
    hero: {
      title: ['ランタイムに縛られない', 'TypeScriptフレームワーク'],
      lead: [
        'Loutreは型推論を活かしたAPIとDevToolsで、',
        'シンプルな開発体験を提供します。',
      ],
      commandHint: 'ローカル開発ツールを起動',
    },
    links: {
      github: 'GitHub',
      docs: 'ドキュメント',
      architecture: '詳しく見る',
    },
    explicitGraph: {
      title: ['アプリ構造を、ひと目で。', ''],
      body: [
        'Loutre DevToolsなら、Moduleや依存関係、実行の流れをGraphで確認できます。',
      ],
      before: 'コードだけ',
      after: 'Loutre DevTools',
      questions: ['どこから呼ばれる？', '何に依存してる？', 'どこへつながる？'],
      annotation: '一目でわかる。',
    },
    typeInference: {
      eyebrow: 'TYPE INFERENCE',
      title: '型定義は、一度だけ。',
      body: 'Contractに型を書くだけで、RequestもResponseも型がそのまま伝わります。',
      note: 'declare / as / is を使う必要もありません。',
      codeComment: 'stringとして推論される',
    },
    agent: {
      eyebrow: 'FOR AI AGENTS',
      title: ['開発者とAgentで、', '同じGraphを見る。'],
      body: 'Application GraphをAgentにも渡せば、開発者とAgentで構造や依存関係を共有できます。',
      graphLabel: 'Application Graph',
      contextLabel: 'Agent context',
    },
    architecture: {
      eyebrow: 'ARCHITECTURE',
      title: 'アプリ全体を、\nひとつのモデルに。',
      body: 'Module、Provider、Execution、Runtime CapabilityをひとつのApplication Modelにまとめ、Runtime、CLI、DevTools、OpenAPIで共有します。',
      annotation: 'One model. Whole picture.',
    },
    runtime: {
      eyebrow: 'MULTI-RUNTIME',
      title: '好みのランタイムで、\nいつものフレームワークを。',
      body: [
        'Node.js、Bun、Deno、Cloudflare Workers、AWS Lambda、Electronに対応。',
        'ランタイムが変わっても、開発スタイルはそのまま。',
      ],
    },
    finalCta: {
      title: 'Hello Loutre!',
      body: 'セットアップ不要。StackBlitzで開いて、今すぐ試せます。',
      stackblitz: 'StackBlitzで試す',
      examples: '他のサンプルを見る',
    },
  },
} as const satisfies Record<Locale, Record<string, unknown>>
