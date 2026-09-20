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
    localLoop: {
      title: 'A smoother local development loop.',
      steps: [
        {
          number: '01',
          title: 'Run',
          body: 'Start the local app with loutre dev. Prepare its Graph and Traces.',
        },
        {
          number: '02',
          title: 'Trace',
          body: 'Follow a request or Task, then find where it happened in the Graph.',
        },
        {
          number: '03',
          title: 'Replay',
          body: 'Change the input and replay the execution while the context is fresh.',
        },
        {
          number: '04',
          title: 'Fix',
          body: 'Return to the source, edit the code, and run it again.',
        },
      ],
      annotation: 'edit → save → retry',
    },
    agent: {
      eyebrow: 'FOR AI AGENTS',
      title: ['One Application Graph.', 'For developers and agents.'],
      body: [
        'The Graph is structured application context, not just a diagram.',
        'Give coding agents architecture and diagnostics instead of asking them to infer everything from files.',
      ],
      feature: 'Graph Diagnostics → Agent prompt',
      graphLabel: 'Application Graph',
      contextLabel: 'Agent context',
      annotation: 'Same context. Less guesswork.',
    },
    architecture: {
      eyebrow: 'ARCHITECTURE',
      title: 'One model for the whole application.',
      body: 'Modules, Providers, Executions, and Runtime Capabilities form one canonical Application Model shared by Runtime, CLI, DevTools, and OpenAPI.',
      annotation: 'One model. Whole picture.',
    },
    runtime: {
      eyebrow: 'MULTI-RUNTIME',
      title: 'Develop on the runtime you prefer.',
      body: [
        'Keep the application model and choose the runtime that fits your environment.',
        'Run the same code on Node.js, Bun, Deno, Cloudflare Workers, AWS Lambda, or Electron.',
      ],
      modelLabel: 'Application Model',
      adapterLabel: 'Runtime Adapter',
      capability: 'Required capabilities are checked before execution.',
      annotation: 'Change the host, not the app.',
    },
    finalCta: {
      title: 'Run it locally.',
      body: 'Start with a small app. See the whole picture.',
      commandHint: 'Create a new Loutre application',
      annotation: 'Good developers make happier software.',
    },
  },
  ja: {
    hero: {
      title: ['ランタイムに縛られない', 'TypeScriptフレームワーク'],
      lead: [
        'Application Modelを一度定義して、Node.js、Bun、Deno、Cloudflare Workers、AWS Lambda、Electronへ。',
        'Loutre Devなら、その同じmodelから構造と実行の流れを追える。',
      ],
      commandHint: 'ローカル開発ツールを起動',
    },
    links: {
      github: 'GitHub',
      docs: 'ドキュメント',
      architecture: '詳しく見る',
    },
    explicitGraph: {
      title: ['コードを読むだけで、', '全部を推測しなくていい。'],
      body: [
        'Loutreは、Module / Provider / Execution / Runtime Capabilityをcanonical Application Modelとして構築する。',
        'Graphへの投影では、ownership、injection、requirement、Route、Middleware、Handlerの関係が明示される。',
      ],
      before: '従来',
      after: 'Loutre',
      questions: [
        'どこから呼ばれてる？',
        '何に依存してる？',
        '実行はどこまで来た？',
      ],
      annotation: '一目でわかる。',
    },
    localLoop: {
      title: 'ローカル開発のループを、スムーズに。',
      steps: [
        {
          number: '01',
          title: '動かす',
          body: 'loutre devでローカルのアプリを起動。GraphとTraceを準備する。',
        },
        {
          number: '02',
          title: '追う',
          body: 'リクエストやTaskの実行をTraceで追い、Graph上の場所を確認する。',
        },
        {
          number: '03',
          title: '試す',
          body: '気になる実行の入力を変えてReplay。その場でもう一度確かめる。',
        },
        {
          number: '04',
          title: '直す',
          body: 'Source locationからコードへ戻って修正し、もう一度動かす。',
        },
      ],
      annotation: 'edit → save → retry',
    },
    agent: {
      eyebrow: 'FOR AI AGENTS',
      title: ['同じApplication Graphを、', '開発者にもエージェントにも。'],
      body: [
        'LoutreのGraphは、人が見るためだけの図ではない。',
        '構造化されたApplication Modelと診断情報を、Coding Agentのcontextとして渡せる。',
      ],
      feature: 'Graph Diagnostics → Agent prompt',
      graphLabel: 'Application Graph',
      contextLabel: 'Agent context',
      annotation: 'Same context. Less guesswork.',
    },
    architecture: {
      eyebrow: 'ARCHITECTURE',
      title: 'アプリケーションを、1つのモデルで。',
      body: 'Module、Provider、Execution、Runtime Capability。Loutreはそれらをcanonical Application Modelとして構築し、Runtime、CLI、DevTools、OpenAPIが同じmodelを参照する。',
      annotation: 'One model. Whole picture.',
    },
    runtime: {
      eyebrow: 'MULTI-RUNTIME',
      title: 'お好みのランタイムで、開発可能。',
      body: [
        'アプリケーションの構造はそのままに、開発環境や配備先に合わせてRuntimeを選べる。',
        'Node.js、Bun、Deno、Cloudflare Workers、AWS Lambda、Electronで同じmodelを動かせる。',
      ],
      modelLabel: 'Application Model',
      adapterLabel: 'Runtime Adapter',
      capability: '必要なRuntime Capabilityは実行前に検証される。',
      annotation: '変えるのは、アプリではなく実行先。',
    },
    finalCta: {
      title: 'さあ、動かしてみよう。',
      body: 'ローカルからはじめる、次の開発体験。',
      commandHint: '新しいLoutreアプリケーションを作成',
      annotation: 'Good developers make happier software.',
    },
  },
} as const satisfies Record<Locale, Record<string, unknown>>
